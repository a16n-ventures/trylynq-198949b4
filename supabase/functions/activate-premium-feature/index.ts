import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const {
      user_id,
      feature_type,
      transaction_reference,
      amount_paid,
      billing_period,
      expires_at,
      flutterwave_transaction_id
    } = await req.json()

    // 1. Store transaction record
    await supabase.from('transactions').insert({
      user_id,
      amount: amount_paid,
      type: 'premium_upgrade',
      status: 'completed',
      reference: transaction_reference,
      flutterwave_transaction_id,
      description: `Premium feature: ${feature_type}`
    })

    // 2. Activate premium feature
    const { error: featureError } = await supabase
      .from('premium_features')
      .insert({
        user_id,
        feature_type,
        status: 'active',
        expires_at,
        transaction_reference,
        amount_paid,
        billing_period
      })

    if (featureError) throw featureError

    return new Response(
      JSON.stringify({ success: true, message: 'Feature activated' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
