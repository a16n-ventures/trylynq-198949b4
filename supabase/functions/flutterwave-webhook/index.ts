import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FLUTTERWAVE_SECRET_HASH = Deno.env.get("FLUTTERWAVE_SECRET_HASH")!;

serve(async (req) => {
  try {
    // 1. SECURITY CHECK: Verify it's actually from Flutterwave
    const signature = req.headers.get("verif-hash");
    if (!signature || signature !== FLUTTERWAVE_SECRET_HASH) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const event = payload.event;
    const data = payload.data;

    // Initialize Admin Client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. HANDLE SUCCESSFUL CHARGE
    if (event === "charge.completed" && data.status === "successful") {
      
      // Extract User ID from tx_ref (Format: "lynq-USERID-TIMESTAMP")
      const userId = data.tx_ref.split("-")[1];

      // A. Log the Payment
      await supabase.from("payments").insert({
        user_id: userId,
        amount: data.amount,
        status: "success",
        tx_ref: data.tx_ref,
        flw_ref: data.flw_ref,
      });

      // B. Calculate Expiration
      const isYearly = data.amount > 5000; 
      const duration = isYearly ? 365 : 30;
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      // C. Update Subscription (Upsert)
      const { error } = await supabase
        .from("subscriptions")
        .upsert({
          user_id: userId,
          status: "active",
          plan_interval: isYearly ? "yearly" : "monthly",
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }
});
