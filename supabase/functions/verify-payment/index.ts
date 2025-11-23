import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FLUTTERWAVE_SECRET_KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In verify-payment function, add:

// 1. Check for duplicate processing
const { data: existingPayment } = await supabase
  .from('payments')
  .select('id')
  .eq('transaction_id', transaction_id)
  .single();

if (existingPayment) {
  return new Response(
    JSON.stringify({ status: 'already_processed' }),
    { status: 200, headers: corsHeaders }
  );
}

// 2. Validate tx_ref format and ownership
const txRefParts = tx_ref.split('-');
if (txRefParts[0] !== 'lynq' || !txRefParts[1]) {
  throw new Error('Invalid tx_ref format');
}

const userId = txRefParts[1];
const { data: { user } } = await supabase.auth.getUser(authHeader);
if (userId !== user.id) {
  throw new Error('Transaction belongs to different user');
}

// 3. Store tx_ref in payments to prevent reuse
await supabase.from('payments').insert({
  user_id: userId,
  transaction_id: String(transaction_id),
  tx_ref: tx_ref,  // Critical for deduplication
  flw_ref: transaction.flw_ref,
  amount: transaction.amount,
  status: 'success'
});

serve(async (req) => {
  // Handle CORS (Browser security)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transaction_id, tx_ref, expected_amount } = await req.json();

    if (!transaction_id) throw new Error("Missing transaction ID");

    // 1. VERIFY WITH FLUTTERWAVE
    // We do not trust the frontend. We ask Flutterwave directly.
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

    // 2. SECURITY CHECKS
    // Check A: Was the transaction actually successful?
    if (transaction.status !== "successful") {
      throw new Error("Transaction was not successful");
    }

    // Check B: Did they pay the correct amount?
    // (Prevents hackers from modifying the HTML to pay ₦1 instead of ₦20,000)
    if (transaction.amount < expected_amount) {
      throw new Error(`Fraud detected: Amount paid (${transaction.amount}) is less than expected (${expected_amount})`);
    }

    // Check C: Currency Check
    if (transaction.currency !== "NGN") {
      throw new Error("Invalid currency");
    }

    // 3. UPGRADE THE USER
    // We use the SERVICE_ROLE_KEY here, which bypasses RLS.
    // The user cannot do this themselves.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Extract user ID from the tx_ref (we set this as "lynq-USERID-timestamp" in frontend)
    const userId = tx_ref.split('-')[1]; 

    // Update their profile to Premium
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        is_premium: true,
        premium_updated_at: new Date().toISOString()
        // You could also add an expiration date here logic based on monthly/yearly
      })
      .eq("user_id", userId);

    if (updateError) throw updateError;

    // 4. LOG THE TRANSACTION (For your Revenue Dashboard)
    await supabase.from("payments").insert({
      user_id: userId,
      amount: transaction.amount,
      provider: "flutterwave",
      transaction_id: String(transaction_id),
      status: "success"
    });

    return new Response(
      JSON.stringify({ status: "success", message: "Payment verified and account upgraded" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
  
