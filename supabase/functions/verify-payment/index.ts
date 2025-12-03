import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLUTTERWAVE_SECRET_KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS (Browser security)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transaction_id, tx_ref, expected_amount } = await req.json();

    if (!transaction_id) throw new Error("Missing transaction ID");

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check for duplicate processing
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('tx_ref', tx_ref)
      .single();

    if (existingPayment) {
      return new Response(
        JSON.stringify({ status: 'already_processed' }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. VERIFY WITH FLUTTERWAVE
    const flwResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    const flwData = await flwResponse.json();

    if (flwData.status !== "success") {
      throw new Error("Flutterwave verification failed");
    }

    const transaction = flwData.data;

    // 3. SECURITY CHECKS
    if (transaction.status !== "successful") {
      throw new Error("Transaction was not successful");
    }

    if (transaction.amount < expected_amount) {
      throw new Error(`Fraud detected: Amount paid (${transaction.amount}) is less than expected (${expected_amount})`);
    }

    if (transaction.currency !== "NGN") {
      throw new Error("Invalid currency");
    }

    // 4. Validate tx_ref format and extract user ID
    const txRefParts = tx_ref.split('-');
    if (txRefParts[0] !== 'lynq' || !txRefParts[1]) {
      throw new Error('Invalid tx_ref format');
    }

    const userId = txRefParts[1];

    // 5. UPGRADE THE USER
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        is_premium: true,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (updateError) throw updateError;

    // 6. LOG THE TRANSACTION
    await supabase.from("payments").insert({
      user_id: userId,
      amount: transaction.amount,
      tx_ref: tx_ref,
      flw_ref: transaction.flw_ref,
      status: "success"
    });

    return new Response(
      JSON.stringify({ status: "success", message: "Payment verified and account upgraded" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ status: "error", message: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
