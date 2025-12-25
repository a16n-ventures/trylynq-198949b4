import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Zap, Star, TrendingUp, ArrowLeft, Check, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext'; 
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePremiumFeatures, useHasFeature } from '@/hooks/usePremiumFeatures';
import { initiatePremiumPayment } from '@/utils/premiumPayment';
import { FeatureCard } from '@/components/premium/FeatureCard';

// --- Type definitions ---
declare global {
  interface Window {
    FlutterwaveCheckout?: (options: any) => void;
  }
}

const loadFlutterwaveScript = () => {
  return new Promise<void>((resolve, reject) => {
    if (document.getElementById('flutterwave-script')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'flutterwave-script';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
    document.body.appendChild(script);
  });
};

const FLUTTERWAVE_PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;

const Premium = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); 
  const queryClient = useQueryClient(); 
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: premiumFeatures = [], isLoading: isLoadingFeatures } = usePremiumFeatures(user?.id);
  const hasFullPackage = useHasFeature(user?.id, 'full_package');
  const hasProfileBoost = useHasFeature(user?.id, 'profile_boost');
  const hasEventBoost = useHasFeature(user?.id, 'event_boost');
  const hasProfileBadge = useHasFeature(user?.id, 'profile_badge');

  // --- 1. CHECK SUBSCRIPTION STATUS ---
  const { data: subscription, isLoading: isLoadingSub } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user
  });

  const isPremiumActive = useMemo(() => {
    if (!subscription) return false;
    const now = new Date();
    const endDate = new Date(subscription.current_period_end);
    return subscription.status === 'active' && endDate > now;
  }, [subscription]);

  // --- 2. FETCH DYNAMIC PRICING (For Bundle) ---
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) throw error;
      return data;
    }
  });

  const pricing = useMemo(() => {
    const remotePrice = settings?.find(s => s.key === 'premium_prices')?.value as { monthly?: number; yearly?: number } | undefined;
    return {
      monthly: remotePrice?.monthly || 7499, 
      yearly: remotePrice?.yearly || 49999   
    };
  }, [settings]);

  useEffect(() => {
    if (!FLUTTERWAVE_PUBLIC_KEY) return;
    loadFlutterwaveScript()
      .then(() => setScriptLoaded(true))
      .catch(() => toast.error('Failed to load payment system'));
  }, []);

  // --- 3. PAYMENT HANDLER ---
  const handlePayment = (
    featureType: 'full_package' | 'profile_boost' | 'event_boost' | 'profile_badge',
    amount: number,
    title: string
  ) => {
    if (!scriptLoaded || !FLUTTERWAVE_PUBLIC_KEY) {
      toast.error('Payment system loading...');
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    setIsProcessing(true);

    initiatePremiumPayment(
      {
        userId: user.id,
        userEmail: user.email || '',
        featureType,
        amount,
        billingPeriod,
        featureTitle: title
      },
      FLUTTERWAVE_PUBLIC_KEY,
      () => {
        // Success callback
        queryClient.invalidateQueries({ queryKey: ['premium-features'] });
        navigate('/app/profile');
        setIsProcessing(false);
      },
      () => {
        // Close callback
        setIsProcessing(false);
      }
    );
  };
  // FIX #1: Removed stray 'window.FlutterwaveCheckout' code that was here causing syntax errors

  // --- 4. FEATURES LIST (Bundle vs Single) ---
  const fullPremiumFeatures = [
    'Unlimited friend requests',
    'Advanced search filters',
    'Priority customer support',
    'Analytics for your events',
    'Custom profile themes',
    'Ad-free experience',
  ];

  // The "A La Carte" menu
  const singleFeatures = [
    {
      // FIX #2: Added 'type' property so we can identify features in the loop
      type: 'profile_boost' as const, 
      icon: <Crown className="w-5 h-5" />,
      title: 'Profile Visibility Boost',
      description: 'Get 20x more profile views and friend suggestions',
      price: { monthly: 2499, yearly: 24999 }
    },
    {
      type: 'event_boost' as const,
      icon: <TrendingUp className="w-5 h-5" />,
      title: 'Event Promotion',
      description: 'Promote your events to reach more people in your area',
      price: { monthly: 1499, yearly: 14999 }
    },
    {
      type: 'profile_badge' as const,
      icon: <Star className="w-5 h-5" />,
      title: 'Premium Badge',
      description: 'Stand out with a special premium badge on your profile',
      price: { monthly: 999, yearly: 9999 }
    }
  ];

  const yearlySavings = Math.round((pricing.monthly * 12) - pricing.yearly);

  if (isLoadingSettings || isLoadingSub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="gradient-primary text-white">
        <div className="container-mobile py-4">
          <div className="flex items-center gap-3 mb-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/20 -ml-2"
              onClick={() => navigate('/app/profile')}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <h1 className="text-xl font-bold">Premium</h1>
          </div>
          <p className="text-white/80 text-sm mb-4">
            {isPremiumActive ? "You are currently a Premium member." : "Upgrade your social life with Ahmia Premium."}
          </p>
        </div>
      </div>

      <div className="container-mobile -mt-4 relative z-10 space-y-6">
        
        {/* Billing Toggle */}
        {!isPremiumActive && (
          <div className="bg-card rounded-xl p-1.5 flex items-center shadow-sm border relative">
            <div 
              className={`flex-1 py-2 text-center text-sm font-medium rounded-lg cursor-pointer transition-all ${billingPeriod === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </div>
            <div 
              className={`flex-1 py-2 text-center text-sm font-medium rounded-lg cursor-pointer transition-all relative ${billingPeriod === 'yearly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setBillingPeriod('yearly')}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                SAVE 30%
              </span>
            </div>
          </div>
        )}

        {/* 1. MAIN BUNDLE CARD */}
        <Card className={`border-primary/50 shadow-lg relative overflow-hidden ${isPremiumActive ? 'bg-primary/5' : 'bg-gradient-to-br from-background to-primary/5'}`}>
           {isPremiumActive && (
             <div className="absolute top-0 right-0 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
               <Check className="w-3 h-3" /> ACTIVE
             </div>
           )}
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Ahmia Unlimited</CardTitle>
                <p className="text-xs text-muted-foreground">All features included</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {fullPremiumFeatures.map((f, i) => (
                 <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                   <Check className="w-4 h-4 text-green-500 shrink-0" />
                   {f}
                 </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border/50">
               <div className="flex items-end justify-between mb-3">
                 <div>
                   <span className="text-3xl font-bold tracking-tight">
                     ₦{billingPeriod === 'monthly' ? pricing.monthly.toLocaleString() : pricing.yearly.toLocaleString()}
                   </span>
                   <span className="text-sm text-muted-foreground">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                 </div>
                 {billingPeriod === 'yearly' && !isPremiumActive && (
                   <div className="text-right">
                     <div className="text-xs font-bold text-green-600">Save ₦{yearlySavings.toLocaleString()}</div>
                   </div>
                 )}
               </div>
               
               <Button 
                  className="w-full gradient-primary text-white h-11 shadow-md"
                  onClick={() => handlePayment(
                    'full_package', // FIX #3: Added missing 'featureType' argument
                    billingPeriod === 'monthly' ? pricing.monthly : pricing.yearly,
                    'Lynq Unlimited'
                  )}
                  disabled={isProcessing || isPremiumActive}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : isPremiumActive ? "Plan Active" : "Get Unlimited Access"}
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* 2. SINGLE UPGRADES SECTION */}
        {!hasFullPackage && (
          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-sm text-muted-foreground ml-1 uppercase tracking-wider">Single Upgrades</h3>
            {singleFeatures.map((feature) => (
              <FeatureCard
                key={feature.type}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                // FIX #4: Use the price from the 'feature' object itself, NOT global 'pricing'
                monthlyPrice={feature.price.monthly} 
                yearlyPrice={feature.price.yearly}
                billingPeriod={billingPeriod}
                isProcessing={isProcessing}
                isActive={
                  feature.type === 'profile_boost' ? hasProfileBoost :
                  feature.type === 'event_boost' ? hasEventBoost :
                  hasProfileBadge
                }
                onPurchase={() => handlePayment(
                  feature.type,
                  billingPeriod === 'monthly' ? feature.price.monthly : feature.price.yearly,
                  feature.title
                )}
              />
            ))}
          </div>
        )}

        <div className="text-center space-y-2 pb-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
             <AlertCircle className="w-4 h-4" />
             <span className="text-xs">Secure payments processed by Flutterwave</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Premium;
