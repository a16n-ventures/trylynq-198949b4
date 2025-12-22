import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PaymentConfig {
  userId: string;
  userEmail: string;
  featureType: 'full_package' | 'profile_boost' | 'event_boost' | 'profile_badge';
  amount: number;
  billingPeriod: 'monthly' | 'yearly';
  featureTitle: string;
}

export const initiatePremiumPayment = (
  config: PaymentConfig,
  flutterwavePublicKey: string,
  onSuccess: () => void,
  onClose: () => void
) => {
  const tx_ref = `premium-${config.featureType}-${config.userId}-${Date.now()}`;

  const flutterwaveConfig = {
    public_key: flutterwavePublicKey,
    tx_ref: tx_ref,
    amount: config.amount,
    currency: "NGN",
    payment_options: "card, banktransfer, ussd",
    customer: {
      email: config.userEmail || "user@ahmia.app",
      name: config.userEmail || "Ahmia User",
    },
    customizations: {
      title: "Ahmia Premium",
      description: `Upgrade: ${config.featureTitle}`,
      logo: "https://try.usecorridor.xyz/ahmia/logo.png",
    },
    callback: async function(response: any) {
      const toastId = toast.loading("Processing your payment...");
      
      try {
        // Store transaction record
        const expiresAt = new Date();
        if (config.billingPeriod === 'monthly') {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        } else {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }

        // Call Edge Function to activate premium feature
        const { data, error } = await supabase.functions.invoke('activate-premium-feature', {
          body: {
            user_id: config.userId,
            feature_type: config.featureType,
            transaction_reference: tx_ref,
            amount_paid: config.amount,
            billing_period: config.billingPeriod,
            expires_at: expiresAt.toISOString(),
            flutterwave_transaction_id: response.transaction_id,
          }
        });

        if (error) throw error;

        toast.success("Premium feature activated! 🎉", { id: toastId });
        onSuccess();
        
      } catch (err: any) {
        console.error('Premium activation error:', err);
        toast.error(err.message || "Failed to activate premium feature", { id: toastId });
      }
    },
    onclose: function() {
      onClose();
    }
  };

  if (window.FlutterwaveCheckout) {
    window.FlutterwaveCheckout(flutterwaveConfig);
  } else {
    toast.error('Payment system not loaded');
  }
};
