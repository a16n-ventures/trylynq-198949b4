import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Save, AlertCircle, DollarSign, Sparkles,
  Shield, Bell, Zap, Brain, Users, Crown, TrendingUp,
  Star, Calendar, Heart, MapPin, Megaphone, RefreshCw,
  CheckCircle2, XCircle, ChevronDown, ChevronUp
} from "lucide-react";
import AdvertisementsManager from "@/components/admin/AdvertisementsManager";
import PremiumFeaturesManager from "@/components/admin/PremiumFeaturesManager";

// ── Types ─────────────────────────────────────────────────────────────────────
type PriceSettings = {
  full_package:  { monthly: number; yearly: number };
  event_boost:   { weekly: number };
  profile_boost: { monthly: number; yearly: number };
  profile_badge: { monthly: number; yearly: number };
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

type CityMilestone = {
  id: string;
  city_name: string;
  center_lat: number;
  center_long: number;
  radius_km: number;
  target_count: number;
  current_count: number;
  is_unlocked: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => `₦${n.toLocaleString()}`;
const savingsPct = (monthly: number, yearly: number) =>
  monthly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;

// ── Compact Price Row ─────────────────────────────────────────────────────────
function PriceRow({
  label, value, onChange, badge,
}: { label: string; value: number; onChange: (v: number) => void; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{label}</span>
        {badge && <Badge variant="outline" className="text-[10px] shrink-0">{badge}</Badge>}
      </div>
      <div className="relative w-36 shrink-0">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₦</span>
        <Input
          type="number"
          className="pl-6 h-8 text-sm"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

// ── Compact Flag Row ──────────────────────────────────────────────────────────
function FlagRow({
  icon: Icon, label, description, checked, onChange, danger,
}: {
  icon: any; label: string; description: string;
  checked: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg ${danger ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900' : 'hover:bg-muted/40'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${danger ? 'text-red-500' : 'text-muted-foreground'}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium leading-none ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className={danger ? 'data-[state=checked]:bg-red-600' : ''}
      />
    </div>
  );
}

// ── City Milestone Row ────────────────────────────────────────────────────────
function MilestoneRow({
  milestone, onToggle, onUpdate,
}: {
  milestone: CityMilestone;
  onToggle: (id: string, unlocked: boolean) => void;
  onUpdate: (id: string, field: string, value: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = milestone.target_count > 0
    ? Math.min(100, Math.round((milestone.current_count / milestone.target_count) * 100))
    : 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{milestone.city_name}</span>
          <Badge variant={milestone.is_unlocked ? "default" : "secondary"} className="text-[10px] shrink-0">
            {milestone.is_unlocked ? "Live" : "Locked"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">{milestone.current_count}/{milestone.target_count}</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <Switch
            checked={milestone.is_unlocked}
            onCheckedChange={(v) => { onToggle(milestone.id, v); }}
            onClick={(e) => e.stopPropagation()}
          />
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/20 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Target Pioneers</Label>
            <Input
              type="number"
              className="h-8 text-sm"
              value={milestone.target_count}
              onChange={(e) => onUpdate(milestone.id, 'target_count', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Radius (km)</Label>
            <Input
              type="number"
              className="h-8 text-sm"
              value={milestone.radius_km}
              onChange={(e) => onUpdate(milestone.id, 'radius_km', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Center Lat</Label>
            <Input
              type="number"
              step="0.0001"
              className="h-8 text-sm"
              value={milestone.center_lat}
              onChange={(e) => onUpdate(milestone.id, 'center_lat', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Center Long</Label>
            <Input
              type="number"
              step="0.0001"
              className="h-8 text-sm"
              value={milestone.center_long}
              onChange={(e) => onUpdate(milestone.id, 'center_long', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AdminSettings() {
  const queryClient = useQueryClient();

  const [prices, setPrices] = useState<PriceSettings>({
    full_package:  { monthly: 7499, yearly: 49999 },
    event_boost:   { weekly: 4499 },
    profile_boost: { monthly: 2499, yearly: 24999 },
    profile_badge: { monthly: 1499, yearly: 14999 },
  });

  const [flags, setFlags] = useState<FlagSettings>({
    maintenance_mode: false,
    allow_signups: true,
    enable_referrals: true,
    enable_ai_recommendations: true,
    enable_push_notifications: true,
  });

  const [aiSettings, setAISettings] = useState<AISettings>({
    model: 'google/gemini-2.5-flash',
    max_recommendations: 20,
    recommendation_refresh_hours: 6,
    premium_boost_multiplier: 50,
    enable_personalization: true,
    system_prompt: 'You are an AI assistant helping users discover events and connect with friends.',
  });

  const [milestones, setMilestones] = useState<CityMilestone[]>([]);
  const [newCity, setNewCity] = useState({ city_name: '', center_lat: '', center_long: '', radius_km: '25', target_count: '500' });
  const [addingCity, setAddingCity] = useState(false);

  // ── Fetch app settings ──────────────────────────────────────────────────────
  const { data: settings, isLoading } = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch city milestones ───────────────────────────────────────────────────
  const { data: milestonesData, isLoading: milestonesLoading } = useQuery({
    queryKey: ['city_milestones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('city_milestones')
        .select('*')
        .order('city_name', { ascending: true });
      if (error) throw error;
      return data as CityMilestone[];
    },
  });

  useEffect(() => {
    if (milestonesData) setMilestones(milestonesData);
  }, [milestonesData]);

  // ── Parse app_settings on load ─────────────────────────────────────────────
  useEffect(() => {
    if (!settings) return;
    const priceData = settings.find(s => s.key === 'premium_prices')?.value;
    const flagData  = settings.find(s => s.key === 'system_flags')?.value;
    const aiData    = settings.find(s => s.key === 'ai_settings')?.value;

    if (priceData && typeof priceData === 'object' && !Array.isArray(priceData)) {
      const p = priceData as any;
      setPrices({
        full_package:  { monthly: p.full_package?.monthly  || 7499,  yearly: p.full_package?.yearly  || 49999 },
        event_boost:   { weekly:  p.event_boost?.weekly    || 4499 },
        profile_boost: { monthly: p.profile_boost?.monthly || 2499,  yearly: p.profile_boost?.yearly || 24999 },
        profile_badge: { monthly: p.profile_badge?.monthly || 1499,  yearly: p.profile_badge?.yearly || 14999 },
      });
    }
    if (flagData && typeof flagData === 'object' && !Array.isArray(flagData)) {
      const f = flagData as Record<string, unknown>;
      setFlags({
        maintenance_mode:         typeof f.maintenance_mode         === 'boolean' ? f.maintenance_mode         : false,
        allow_signups:            typeof f.allow_signups            === 'boolean' ? f.allow_signups            : true,
        enable_referrals:         typeof f.enable_referrals         === 'boolean' ? f.enable_referrals         : true,
        enable_ai_recommendations:typeof f.enable_ai_recommendations=== 'boolean' ? f.enable_ai_recommendations: true,
        enable_push_notifications:typeof f.enable_push_notifications=== 'boolean' ? f.enable_push_notifications: true,
      });
    }
    if (aiData && typeof aiData === 'object' && !Array.isArray(aiData)) {
      const a = aiData as Record<string, unknown>;
      setAISettings({
        model:                        typeof a.model                        === 'string'  ? a.model                        : 'google/gemini-2.5-flash',
        max_recommendations:          typeof a.max_recommendations          === 'number'  ? a.max_recommendations          : 20,
        recommendation_refresh_hours: typeof a.recommendation_refresh_hours === 'number'  ? a.recommendation_refresh_hours : 6,
        premium_boost_multiplier:     typeof a.premium_boost_multiplier     === 'number'  ? a.premium_boost_multiplier     : 50,
        enable_personalization:       typeof a.enable_personalization       === 'boolean' ? a.enable_personalization       : true,
        system_prompt:                typeof a.system_prompt                === 'string'  ? a.system_prompt                : aiSettings.system_prompt,
      });
    }
  }, [settings]);

  // ── Save app settings ───────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('app_settings')
        .select('key')
        .in('key', ['premium_prices', 'system_flags', 'ai_settings']);
      const existingKeys = new Set(existing?.map(s => s.key) || []);

      const upsert = async (key: string, value: any, description: string) => {
        if (existingKeys.has(key)) {
          await supabase.from('app_settings')
            .update({ value, updated_by: user.id, updated_at: new Date().toISOString() })
            .eq('key', key);
        } else {
          await supabase.from('app_settings')
            .insert({ key, value, updated_by: user.id, description });
        }
      };

      await upsert('premium_prices', prices, 'Premium pricing configuration');
      await upsert('system_flags',   flags,  'System feature flags');
      await upsert('ai_settings',    aiSettings, 'AI settings');
    },
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['app_settings'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  // ── Toggle city milestone unlocked ─────────────────────────────────────────
  const toggleMilestoneMutation = useMutation({
    mutationFn: async ({ id, is_unlocked }: { id: string; is_unlocked: boolean }) => {
      const { error } = await supabase
        .from('city_milestones')
        .update({ is_unlocked })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('City updated');
      queryClient.invalidateQueries({ queryKey: ['city_milestones'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Update milestone field locally ─────────────────────────────────────────
  const handleMilestoneUpdate = (id: string, field: string, value: any) => {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  // ── Save individual milestone edits ────────────────────────────────────────
  const saveMilestoneMutation = useMutation({
    mutationFn: async (milestone: CityMilestone) => {
      const { error } = await supabase
        .from('city_milestones')
        .update({
          target_count: milestone.target_count,
          radius_km:    milestone.radius_km,
          center_lat:   milestone.center_lat,
          center_long:  milestone.center_long,
          is_unlocked:  milestone.is_unlocked,
        })
        .eq('id', milestone.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Milestone saved');
      queryClient.invalidateQueries({ queryKey: ['city_milestones'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Add new city ────────────────────────────────────────────────────────────
  const addCityMutation = useMutation({
    mutationFn: async () => {
      if (!newCity.city_name.trim()) throw new Error('City name is required');
      const { error } = await supabase.from('city_milestones').insert({
        city_name:     newCity.city_name.trim(),
        center_lat:    parseFloat(newCity.center_lat)   || 0,
        center_long:   parseFloat(newCity.center_long)  || 0,
        radius_km:     parseFloat(newCity.radius_km)    || 25,
        target_count:  parseInt(newCity.target_count)   || 500,
        current_count: 0,
        is_unlocked:   false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('City added');
      setNewCity({ city_name: '', center_lat: '', center_long: '', radius_km: '25', target_count: '500' });
      setAddingCity(false);
      queryClient.invalidateQueries({ queryKey: ['city_milestones'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="p-8 flex justify-center">
      <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4 pb-20 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Config</h2>
          <p className="text-sm text-muted-foreground">Pricing, features, cities, AI and system settings.</p>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </Button>
      </div>

      <Tabs defaultValue="pricing" className="w-full">
        <TabsList className="grid w-full grid-cols-6 mb-4">
          <TabsTrigger value="pricing"  className="text-xs gap-1"><DollarSign className="w-3.5 h-3.5" />Pricing</TabsTrigger>
          <TabsTrigger value="cities"   className="text-xs gap-1"><MapPin className="w-3.5 h-3.5" />Cities</TabsTrigger>
          <TabsTrigger value="features" className="text-xs gap-1"><Zap className="w-3.5 h-3.5" />Features</TabsTrigger>
          <TabsTrigger value="premium"  className="text-xs gap-1"><Star className="w-3.5 h-3.5" />Premium</TabsTrigger>
          <TabsTrigger value="ai"       className="text-xs gap-1"><Brain className="w-3.5 h-3.5" />AI</TabsTrigger>
          <TabsTrigger value="system"   className="text-xs gap-1"><Shield className="w-3.5 h-3.5" />System</TabsTrigger>
        </TabsList>

        {/* ── PRICING TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="pricing" className="space-y-3">
          {/* Full Package */}
          <div className="border rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-yellow-500" />
              <span className="font-semibold text-sm">Full Package — Ahmia Unlimited</span>
              <Badge variant="outline" className="text-[10px] ml-auto">All features</Badge>
            </div>
            <PriceRow
              label="Monthly" value={prices.full_package.monthly}
              onChange={(v) => setPrices({ ...prices, full_package: { ...prices.full_package, monthly: v } })}
              badge="Recurring"
            />
            <PriceRow
              label="Yearly" value={prices.full_package.yearly}
              onChange={(v) => setPrices({ ...prices, full_package: { ...prices.full_package, yearly: v } })}
              badge="Best Value"
            />
            {prices.full_package.monthly > 0 && (
              <p className="text-xs text-green-600 font-medium pt-1 pl-1">
                💰 Saves {savingsPct(prices.full_package.monthly, prices.full_package.yearly)}% vs monthly
                · {fmt(prices.full_package.monthly * 12 - prices.full_package.yearly)} off/yr
              </p>
            )}
          </div>

          {/* Event Boost */}
          <div className="border rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-orange-500" />
              <span className="font-semibold text-sm">Event Boost</span>
              <Badge variant="outline" className="text-[10px] ml-auto">7-day one-time</Badge>
            </div>
            <PriceRow
              label="Weekly (7 days)" value={prices.event_boost.weekly}
              onChange={(v) => setPrices({ ...prices, event_boost: { weekly: v } })}
            />
            <p className="text-xs text-muted-foreground pl-1 pt-1">
              Promotes event to top of feed. Per-event, not subscription.
            </p>
          </div>

          {/* Profile Boost */}
          <div className="border rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-sm">Profile Visibility Boost</span>
              <Badge variant="outline" className="text-[10px] ml-auto">20× visibility</Badge>
            </div>
            <PriceRow
              label="Monthly" value={prices.profile_boost.monthly}
              onChange={(v) => setPrices({ ...prices, profile_boost: { ...prices.profile_boost, monthly: v } })}
            />
            <PriceRow
              label="Yearly" value={prices.profile_boost.yearly}
              onChange={(v) => setPrices({ ...prices, profile_boost: { ...prices.profile_boost, yearly: v } })}
            />
            {prices.profile_boost.monthly > 0 && (
              <p className="text-xs text-green-600 pt-1 pl-1">
                Save {savingsPct(prices.profile_boost.monthly, prices.profile_boost.yearly)}% annually
              </p>
            )}
          </div>

          {/* Profile Badge */}
          <div className="border rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-purple-500" />
              <span className="font-semibold text-sm">Premium Profile Badge</span>
              <Badge variant="outline" className="text-[10px] ml-auto">Verified badge</Badge>
            </div>
            <PriceRow
              label="Monthly" value={prices.profile_badge.monthly}
              onChange={(v) => setPrices({ ...prices, profile_badge: { ...prices.profile_badge, monthly: v } })}
            />
            <PriceRow
              label="Yearly" value={prices.profile_badge.yearly}
              onChange={(v) => setPrices({ ...prices, profile_badge: { ...prices.profile_badge, yearly: v } })}
            />
            {prices.profile_badge.monthly > 0 && (
              <p className="text-xs text-green-600 pt-1 pl-1">
                Save {savingsPct(prices.profile_badge.monthly, prices.profile_badge.yearly)}% annually
              </p>
            )}
          </div>
        </TabsContent>

        {/* ── CITIES TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="cities" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Launch Zone Cities</p>
              <p className="text-xs text-muted-foreground">Toggle cities live/locked and edit their parameters.</p>
            </div>
            <Button
              size="sm" variant="outline"
              className="text-xs gap-1.5"
              onClick={() => setAddingCity(!addingCity)}
            >
              <MapPin className="w-3.5 h-3.5" />
              {addingCity ? 'Cancel' : 'Add City'}
            </Button>
          </div>

          {/* Add city form */}
          {addingCity && (
            <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New City</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">City Name</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g. Lagos"
                    value={newCity.city_name}
                    onChange={(e) => setNewCity({ ...newCity, city_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Center Latitude</Label>
                  <Input className="h-8 text-sm" placeholder="6.5244"
                    value={newCity.center_lat}
                    onChange={(e) => setNewCity({ ...newCity, center_lat: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Center Longitude</Label>
                  <Input className="h-8 text-sm" placeholder="3.3792"
                    value={newCity.center_long}
                    onChange={(e) => setNewCity({ ...newCity, center_long: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Radius (km)</Label>
                  <Input className="h-8 text-sm" type="number"
                    value={newCity.radius_km}
                    onChange={(e) => setNewCity({ ...newCity, radius_km: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Target Pioneers</Label>
                  <Input className="h-8 text-sm" type="number"
                    value={newCity.target_count}
                    onChange={(e) => setNewCity({ ...newCity, target_count: e.target.value })} />
                </div>
              </div>
              <Button
                size="sm" className="w-full text-xs"
                onClick={() => addCityMutation.mutate()}
                disabled={addCityMutation.isPending}
              >
                {addCityMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Add City
              </Button>
            </div>
          )}

          {/* Milestones list */}
          {milestonesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
            </div>
          ) : milestones.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border rounded-xl">
              No cities configured yet.
            </div>
          ) : (
            <div className="space-y-2">
              {milestones.map((m) => (
                <div key={m.id}>
                  <MilestoneRow
                    milestone={m}
                    onToggle={(id, unlocked) => {
                      handleMilestoneUpdate(id, 'is_unlocked', unlocked);
                      toggleMilestoneMutation.mutate({ id, is_unlocked: unlocked });
                    }}
                    onUpdate={handleMilestoneUpdate}
                  />
                  <div className="flex justify-end mt-1 pr-1">
                    <button
                      className="text-[10px] text-muted-foreground hover:text-primary"
                      onClick={() => saveMilestoneMutation.mutate(m)}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── FEATURES TAB ────────────────────────────────────────────────── */}
        <TabsContent value="features" className="space-y-2">
          <div className="border rounded-xl overflow-hidden divide-y">
            <FlagRow
              icon={Users} label="New User Registrations"
              description="Pause signups during heavy load"
              checked={flags.allow_signups}
              onChange={(c) => setFlags({ ...flags, allow_signups: c })}
            />
            <FlagRow
              icon={Sparkles} label="Referral System"
              description="Enable invite rewards program"
              checked={flags.enable_referrals}
              onChange={(c) => setFlags({ ...flags, enable_referrals: c })}
            />
            <FlagRow
              icon={Brain} label="AI Recommendations"
              description="Personalized event & friend suggestions"
              checked={flags.enable_ai_recommendations}
              onChange={(c) => setFlags({ ...flags, enable_ai_recommendations: c })}
            />
            <FlagRow
              icon={Bell} label="Push Notifications"
              description="Mobile push notification delivery"
              checked={flags.enable_push_notifications}
              onChange={(c) => setFlags({ ...flags, enable_push_notifications: c })}
            />
          </div>
        </TabsContent>

        {/* ── PREMIUM TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="premium" className="space-y-4">
          <PremiumFeaturesManager />
        </TabsContent>

        {/* ── AI TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-3">
          <div className="border rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              <span className="font-semibold text-sm">AI Recommendation Engine</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">TikTok-Style</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">AI Model</Label>
                <select
                  className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
                  value={aiSettings.model}
                  onChange={(e) => setAISettings({ ...aiSettings, model: e.target.value })}
                >
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                  <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (Quality)</option>
                  <option value="openai/gpt-5-mini">GPT-5 Mini (Balanced)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Recommendations</Label>
                <Input type="number" className="h-8 text-sm"
                  value={aiSettings.max_recommendations}
                  onChange={(e) => setAISettings({ ...aiSettings, max_recommendations: parseInt(e.target.value) || 20 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Refresh Interval (hrs)</Label>
                <Input type="number" className="h-8 text-sm"
                  value={aiSettings.recommendation_refresh_hours}
                  onChange={(e) => setAISettings({ ...aiSettings, recommendation_refresh_hours: parseInt(e.target.value) || 6 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Premium Boost Multiplier</Label>
                <Input type="number" className="h-8 text-sm"
                  value={aiSettings.premium_boost_multiplier}
                  onChange={(e) => setAISettings({ ...aiSettings, premium_boost_multiplier: parseInt(e.target.value) || 50 })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">Enable Personalization</p>
                <p className="text-xs text-muted-foreground">Use interests, location, and behaviour</p>
              </div>
              <Switch
                checked={aiSettings.enable_personalization}
                onCheckedChange={(c) => setAISettings({ ...aiSettings, enable_personalization: c })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">System Prompt</Label>
              <Textarea
                value={aiSettings.system_prompt}
                onChange={(e) => setAISettings({ ...aiSettings, system_prompt: e.target.value })}
                rows={3}
                className="text-sm resize-none"
                placeholder="Instructions for the AI model..."
              />
            </div>
          </div>
        </TabsContent>

        {/* ── SYSTEM TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="system" className="space-y-3">
          <div className="border rounded-xl overflow-hidden">
            <FlagRow
              icon={AlertCircle}
              label="Maintenance Mode"
              description="Shows maintenance screen to all non-admin users"
              checked={flags.maintenance_mode}
              onChange={(c) => setFlags({ ...flags, maintenance_mode: c })}
              danger
            />
          </div>

          {/* Ads tab kept accessible separately */}
          <div className="border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-pink-500" />
              <span className="font-semibold text-sm">Advertisements</span>
            </div>
            <AdvertisementsManager />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
