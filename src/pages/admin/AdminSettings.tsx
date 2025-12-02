import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Save, AlertCircle } from "lucide-react";

type PriceSettings = { monthly: number; yearly: number };
type FlagSettings = { maintenance_mode: boolean; allow_signups: boolean; enable_referrals: boolean };

export default function AdminSettings() {
  const queryClient = useQueryClient();
  
  // Local state for form handling
  const [prices, setPrices] = useState<PriceSettings>({ monthly: 0, yearly: 0 });
  const [flags, setFlags] = useState<FlagSettings>({ maintenance_mode: false, allow_signups: true, enable_referrals: true });

  // 1. Fetch Settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) throw error;
      return data;
    }
  });

  // Sync state when data loads
  useEffect(() => {
    if (settings) {
      const priceData = settings.find(s => s.key === 'premium_prices')?.value;
      const flagData = settings.find(s => s.key === 'system_flags')?.value;
      
      if (priceData && typeof priceData === 'object' && !Array.isArray(priceData)) {
        const p = priceData as Record<string, unknown>;
        setPrices({
          monthly: typeof p.monthly === 'number' ? p.monthly : 0,
          yearly: typeof p.yearly === 'number' ? p.yearly : 0
        });
      }
      if (flagData && typeof flagData === 'object' && !Array.isArray(flagData)) {
        const f = flagData as Record<string, unknown>;
        setFlags({
          maintenance_mode: typeof f.maintenance_mode === 'boolean' ? f.maintenance_mode : false,
          allow_signups: typeof f.allow_signups === 'boolean' ? f.allow_signups : true,
          enable_referrals: typeof f.enable_referrals === 'boolean' ? f.enable_referrals : true
        });
      }
    }
  }, [settings]);

  // 2. Mutation to Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update Prices
      const { error: err1 } = await supabase
        .from('app_settings')
        .update({ value: prices as any, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('key', 'premium_prices');

      // Update Flags
      const { error: err2 } = await supabase
        .from('app_settings')
        .update({ value: flags as any, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('key', 'system_flags');

      if (err1 || err2) throw new Error("Failed to save settings");
    },
    onSuccess: () => {
      toast.success("System settings updated successfully");
      queryClient.invalidateQueries({ queryKey: ['app_settings'] });
    },
    onError: () => toast.error("Failed to save changes")
  });

  if (isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Configuration</h2>
        <p className="text-muted-foreground">Manage pricing, feature flags, and global settings.</p>
      </div>

      {/* 1. Billing & Products */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Pricing (NGN)</CardTitle>
          <CardDescription>Adjusting these values updates the paywall immediately for all users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Subscription</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                <Input 
                  type="number" 
                  className="pl-8"
                  value={prices.monthly}
                  onChange={(e) => setPrices({...prices, monthly: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Yearly Subscription</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                <Input 
                  type="number" 
                  className="pl-8"
                  value={prices.yearly}
                  onChange={(e) => setPrices({...prices, yearly: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. System Controls */}
      <Card className="border-red-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Danger Zone & Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">New User Registrations</Label>
              <p className="text-sm text-muted-foreground">
                Turn this off to pause new signups (e.g. during heavy server load).
              </p>
            </div>
            <Switch 
              checked={flags.allow_signups}
              onCheckedChange={(c) => setFlags({...flags, allow_signups: c})}
            />
          </div>
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Referral System</Label>
              <p className="text-sm text-muted-foreground">
                Enable or disable the invite rewards program.
              </p>
            </div>
            <Switch 
              checked={flags.enable_referrals}
              onCheckedChange={(c) => setFlags({...flags, enable_referrals: c})}
            />
          </div>
          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base text-red-600">Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">
                If enabled, the app will show a "Under Maintenance" screen to all non-admin users.
              </p>
            </div>
            <Switch 
              checked={flags.maintenance_mode}
              onCheckedChange={(c) => setFlags({...flags, maintenance_mode: c})}
              className="data-[state=checked]:bg-red-600"
            />
          </div>

        </CardContent>
      </Card>

      {/* Save Bar */}
      <div className="flex justify-end">
        <Button 
          size="lg" 
          onClick={() => saveMutation.mutate()} 
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
