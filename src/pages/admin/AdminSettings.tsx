import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Loader2, Save, AlertCircle, DollarSign, Sparkles, 
  Settings2, Shield, Bell, Zap, Brain, Users, Crown, TrendingUp, Star, Calendar
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ✅ ENHANCED: Complete price structure matching database schema
type PriceSettings = { 
  full_package: {
    monthly: number;
    yearly: number;
  };
  event_boost: {
    weekly: number; // ✅ Event boost is WEEKLY only
  };
  profile_boost: {
    monthly: number;
    yearly: number;
  };
  profile_badge: {
    monthly: number;
    yearly: number;
  };
};

type FlagSettings = { 
  maintenance_mode: boolean; 
  allow_signups: boolean; 
  enable_referrals: boolean;
  enable_ai_recommendations: boolean;
  enable_push_notifications: boolean;
};

type AISettings = {
  model: string;
  max_recommendations: number;
  recommendation_refresh_hours: number;
  premium_boost_multiplier: number;
  enable_personalization: boolean;
  system_prompt: string;
};

export default function AdminSettings() {
  const queryClient = useQueryClient();
  
  // ✅ ENHANCED: Complete pricing structure with all features
  const [prices, setPrices] = useState<PriceSettings>({ 
    full_package: {
      monthly: 7499,
      yearly: 49999
    },
    event_boost: {
      weekly: 4499
    },
    profile_boost: {
      monthly: 2499,
      yearly: 24999
    },
    profile_badge: {
      monthly: 1499,
      yearly: 14999
    }
  });

  const [flags, setFlags] = useState<FlagSettings>({ 
    maintenance_mode: false, 
    allow_signups: true, 
    enable_referrals: true,
    enable_ai_recommendations: true,
    enable_push_notifications: true
  });

  const [aiSettings, setAISettings] = useState<AISettings>({
    model: 'google/gemini-2.5-flash',
    max_recommendations: 20,
    recommendation_refresh_hours: 6,
    premium_boost_multiplier: 50,
    enable_personalization: true,
    system_prompt: 'You are an AI assistant helping users discover events and connect with friends.'
  });

  // 1. Fetch Settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) throw error;
      return data;
    }
  });

  // ✅ ENHANCED: Robust data parsing with complete structure validation
  useEffect(() => {
    if (settings) {
      const priceData = settings.find(s => s.key === 'premium_prices')?.value;
      const flagData = settings.find(s => s.key === 'system_flags')?.value;
      const aiData = settings.find(s => s.key === 'ai_settings')?.value;
      
      // ✅ Parse complete pricing structure
      if (priceData && typeof priceData === 'object' && !Array.isArray(priceData)) {
        const p = priceData as any;
        
        setPrices({
          full_package: {
            monthly: p.full_package?.monthly || 7499,
            yearly: p.full_package?.yearly || 49999
          },
          event_boost: {
            weekly: p.event_boost?.weekly || 4999
          },
          profile_boost: {
            monthly: p.profile_boost?.monthly || 2499,
            yearly: p.profile_boost?.yearly || 24999
          },
          profile_badge: {
            monthly: p.profile_badge?.monthly || 1499,
            yearly: p.profile_badge?.yearly || 14999
          }
        });
      }

      if (flagData && typeof flagData === 'object' && !Array.isArray(flagData)) {
        const f = flagData as Record<string, unknown>;
        setFlags({
          maintenance_mode: typeof f.maintenance_mode === 'boolean' ? f.maintenance_mode : false,
          allow_signups: typeof f.allow_signups === 'boolean' ? f.allow_signups : true,
          enable_referrals: typeof f.enable_referrals === 'boolean' ? f.enable_referrals : true,
          enable_ai_recommendations: typeof f.enable_ai_recommendations === 'boolean' ? f.enable_ai_recommendations : true,
          enable_push_notifications: typeof f.enable_push_notifications === 'boolean' ? f.enable_push_notifications : true
        });
      }

      if (aiData && typeof aiData === 'object' && !Array.isArray(aiData)) {
        const a = aiData as Record<string, unknown>;
        setAISettings({
          model: typeof a.model === 'string' ? a.model : 'google/gemini-2.5-flash',
          max_recommendations: typeof a.max_recommendations === 'number' ? a.max_recommendations : 20,
          recommendation_refresh_hours: typeof a.recommendation_refresh_hours === 'number' ? a.recommendation_refresh_hours : 6,
          premium_boost_multiplier: typeof a.premium_boost_multiplier === 'number' ? a.premium_boost_multiplier : 50,
          enable_personalization: typeof a.enable_personalization === 'boolean' ? a.enable_personalization : true,
          system_prompt: typeof a.system_prompt === 'string' ? a.system_prompt : aiSettings.system_prompt
        });
      }
    }
  }, [settings]);

  // ✅ ENHANCED: Save all settings with proper structure
  const saveMutation = useMutation({
  mutationFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('Not authenticated');

    // Check if settings exist first
    const { data: existing } = await supabase
      .from('app_settings')
      .select('key')
      .in('key', ['premium_prices', 'system_flags', 'ai_settings']);

    const existingKeys = new Set(existing?.map(s => s.key) || []);

    // Update or Insert for Prices
    if (existingKeys.has('premium_prices')) {
      await supabase
        .from('app_settings')
        .update({ 
          value: prices as any,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'premium_prices');
    } else {
      await supabase
        .from('app_settings')
        .insert({
          key: 'premium_prices',
          value: prices as any,
          updated_by: user.id,
          description: 'Premium pricing configuration'
        });
    }

    // Update or Insert for Flags
    if (existingKeys.has('system_flags')) {
      await supabase
        .from('app_settings')
        .update({ 
          value: flags as any,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'system_flags');
    } else {
      await supabase
        .from('app_settings')
        .insert({
          key: 'system_flags',
          value: flags as any,
          updated_by: user.id,
          description: 'System feature flags'
        });
    }

    // Update or Insert for AI Settings
    if (existingKeys.has('ai_settings')) {
      await supabase
        .from('app_settings')
        .update({ 
          value: aiSettings as any,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'ai_settings');
    } else {
      await supabase
        .from('app_settings')
        .insert({
          key: 'ai_settings',
          value: aiSettings as any,
          updated_by: user.id,
          description: 'AI settings'
        });
    }
  },
  onSuccess: () => {
    toast.success("All settings saved successfully");
    queryClient.invalidateQueries({ queryKey: ['app_settings'] });
  },
  onError: (error: any) => {
    toast.error(error.message || "Failed to save changes");
  }
});

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Configuration</h2>
          <p className="text-muted-foreground">Manage pricing, features, AI, and global settings.</p>
        </div>
        <Button 
          size="lg" 
          onClick={() => saveMutation.mutate()} 
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="pricing" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="pricing" className="gap-2">
            <DollarSign className="w-4 h-4" /> Pricing
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Zap className="w-4 h-4" /> Features
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Brain className="w-4 h-4" /> AI Engine
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Shield className="w-4 h-4" /> System
          </TabsTrigger>
        </TabsList>

        {/* ✅ ENHANCED PRICING TAB - Complete Feature-Based Pricing */}
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          
        <TabsContent value="pricing" className="space-y-4">
          {/* 1. FULL PACKAGE - Unlimited Bundle */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Full Package - Ahmia Unlimited (NGN)
              </CardTitle>
              <CardDescription>Complete premium experience with all features included</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Monthly Subscription
                    <Badge variant="outline" className="text-[10px]">Recurring</Badge>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.full_package.monthly}
                      onChange={(e) => setPrices({
                        ...prices, 
                        full_package: {
                          ...prices.full_package,
                          monthly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Yearly Subscription
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Best Value</Badge>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.full_package.yearly}
                      onChange={(e) => setPrices({
                        ...prices,
                        full_package: {
                          ...prices.full_package,
                          yearly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                  {prices.full_package.yearly > 0 && prices.full_package.monthly > 0 && (
                    <p className="text-xs text-green-600 font-medium">
                      💰 Save {Math.round((1 - prices.full_package.yearly / (prices.full_package.monthly * 12)) * 100)}% vs monthly
                    </p>
                  )}
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Includes:</strong> Unlimited friend requests, Advanced search, Priority support, Event analytics, Custom themes, Ad-free experience
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 2. EVENT BOOST - Weekly Only */}
          <Card className="border-orange-200 dark:border-orange-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                Event Boost (NGN)
              </CardTitle>
              <CardDescription>One-time boost for event visibility - 7 days promotion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-6 max-w-md">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Weekly Boost (7 Days)
                    <Badge variant="outline" className="text-[10px]">One-time</Badge>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.event_boost.weekly}
                      onChange={(e) => setPrices({
                        ...prices,
                        event_boost: {
                          weekly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Promotes event to top of feed for 7 days. Users can buy multiple boosts for different events.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. PROFILE BOOST */}
          <Card className="border-blue-200 dark:border-blue-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                Profile Visibility Boost (NGN)
              </CardTitle>
              <CardDescription>Increase profile visibility by 20x in friend suggestions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Monthly Boost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.profile_boost.monthly}
                      onChange={(e) => setPrices({
                        ...prices,
                        profile_boost: {
                          ...prices.profile_boost,
                          monthly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Yearly Boost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.profile_boost.yearly}
                      onChange={(e) => setPrices({
                        ...prices,
                        profile_boost: {
                          ...prices.profile_boost,
                          yearly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                  {prices.profile_boost.yearly > 0 && prices.profile_boost.monthly > 0 && (
                    <p className="text-xs text-green-600">
                      Save {Math.round((1 - prices.profile_boost.yearly / (prices.profile_boost.monthly * 12)) * 100)}% annually
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. PROFILE BADGE */}
          <Card className="border-purple-200 dark:border-purple-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-purple-500" />
                Premium Profile Badge (NGN)
              </CardTitle>
              <CardDescription>Exclusive verified badge on profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Monthly Badge</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.profile_badge.monthly}
                      onChange={(e) => setPrices({
                        ...prices,
                        profile_badge: {
                          ...prices.profile_badge,
                          monthly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Yearly Badge</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input 
                      type="number" 
                      className="pl-8"
                      value={prices.profile_badge.yearly}
                      onChange={(e) => setPrices({
                        ...prices,
                        profile_badge: {
                          ...prices.profile_badge,
                          yearly: parseInt(e.target.value) || 0
                        }
                      })}
                    />
                  </div>
                  {prices.profile_badge.yearly > 0 && prices.profile_badge.monthly > 0 && (
                    <p className="text-xs text-green-600">
                      Save {Math.round((1 - prices.profile_badge.yearly / (prices.profile_badge.monthly * 12)) * 100)}% annually
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

        </TabsContent>
        </div>

        {/* FEATURES TAB - UNCHANGED */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Toggle features on or off across the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" /> New User Registrations
                  </Label>
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
                  <Label className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Referral System
                  </Label>
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
                  <Label className="text-base flex items-center gap-2">
                    <Brain className="w-4 h-4" /> AI Recommendations
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enable personalized event & friend recommendations.
                  </p>
                </div>
                <Switch 
                  checked={flags.enable_ai_recommendations}
                  onCheckedChange={(c) => setFlags({...flags, enable_ai_recommendations: c})}
                />
              </div>
              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Push Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enable push notifications for mobile users.
                  </p>
                </div>
                <Switch 
                  checked={flags.enable_push_notifications}
                  onCheckedChange={(c) => setFlags({...flags, enable_push_notifications: c})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI ENGINE TAB - UNCHANGED */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                AI Recommendation Engine
                <Badge variant="secondary" className="ml-2">TikTok-Style Algorithm</Badge>
              </CardTitle>
              <CardDescription>
                Configure the AI-powered recommendation system for premium users.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>AI Model</Label>
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={aiSettings.model}
                    onChange={(e) => setAISettings({...aiSettings, model: e.target.value})}
                  >
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                    <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (Quality)</option>
                    <option value="openai/gpt-5-mini">GPT-5 Mini (Balanced)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">Model used for recommendations</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Recommendations</Label>
                  <Input 
                    type="number" 
                    value={aiSettings.max_recommendations}
                    onChange={(e) => setAISettings({...aiSettings, max_recommendations: parseInt(e.target.value) || 20})}
                  />
                  <p className="text-xs text-muted-foreground">Per user per refresh cycle</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Refresh Interval (hours)</Label>
                  <Input 
                    type="number" 
                    value={aiSettings.recommendation_refresh_hours}
                    onChange={(e) => setAISettings({...aiSettings, recommendation_refresh_hours: parseInt(e.target.value) || 6})}
                  />
                  <p className="text-xs text-muted-foreground">How often to refresh recommendations</p>
                </div>
                <div className="space-y-2">
                  <Label>Premium Boost Multiplier</Label>
                  <Input 
                    type="number" 
                    value={aiSettings.premium_boost_multiplier}
                    onChange={(e) => setAISettings({...aiSettings, premium_boost_multiplier: parseInt(e.target.value) || 50})}
                  />
                  <p className="text-xs text-muted-foreground">Score multiplier for premium content (1-100x)</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Personalization</Label>
                  <p className="text-sm text-muted-foreground">
                    Use user interests, location, and behavior to personalize feed.
                  </p>
                </div>
                <Switch 
                  checked={aiSettings.enable_personalization}
                  onCheckedChange={(c) => setAISettings({...aiSettings, enable_personalization: c})}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>AI System Prompt</Label>
                <Textarea 
                  value={aiSettings.system_prompt}
                  onChange={(e) => setAISettings({...aiSettings, system_prompt: e.target.value})}
                  rows={4}
                  placeholder="Instructions for the AI model..."
                />
                <p className="text-xs text-muted-foreground">
                  Custom instructions for how the AI should behave when generating recommendations.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYSTEM TAB - UNCHANGED */}
        <TabsContent value="system" className="space-y-4">
          <Card className="border-red-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                Danger Zone
              </CardTitle>
              <CardDescription>Critical system controls. Use with caution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                <div className="space-y-0.5">
                  <Label className="text-base text-red-600 dark:text-red-400">Maintenance Mode</Label>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
