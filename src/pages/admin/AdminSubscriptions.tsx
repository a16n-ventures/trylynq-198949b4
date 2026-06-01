import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, MoreHorizontal, Crown, XCircle, RefreshCw,
  Loader2, Users, DollarSign, CheckCircle2, Clock, Gift
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, differenceInDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type Subscription = {
  user_id: string;
  status: string;
  plan_type: string | null;
  plan_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  flutterwave_sub_id: string | null;
  profile?: { display_name: string | null; email: string | null; avatar_url?: string | null };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-500 text-white',
    cancelled: 'bg-red-500 text-white',
    expired: 'bg-muted text-muted-foreground',
    lifetime: 'bg-yellow-500 text-black',
  };
  return (
    <Badge className={`${map[status] ?? 'bg-muted text-muted-foreground'} border-0 text-[10px] capitalize`}>
      {status === 'active' && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
      {status === 'lifetime' && <Crown className="w-2.5 h-2.5 mr-1" />}
      {status}
    </Badge>
  );
}

function ExpiryBadge({ end }: { end: string | null }) {
  if (!end) return null;
  const days = differenceInDays(new Date(end), new Date());
  if (isPast(new Date(end))) return <span className="text-[11px] text-red-500">Expired</span>;
  if (days <= 7) return <span className="text-[11px] text-orange-500 font-medium">{days}d left</span>;
  return <span className="text-[11px] text-muted-foreground">{days}d left</span>;
}

function StatTile({ icon: Icon, label, value, sub, color = "text-muted-foreground" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminSubscriptions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled' | 'expired'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ['admin_subscriptions', search, page, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('subscriptions')
        .select('*')
        .order('current_period_start', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data: subs, error } = await query;
      if (error) throw error;
      if (!subs?.length) return [];

      const userIds = subs.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? []);

      let result = subs.map(s => ({
        ...s,
        profile: profileMap.get(s.user_id) ?? { display_name: null, email: null, avatar_url: null },
      })) as unknown as Subscription[];

      if (search) {
        const q = search.toLowerCase();
        result = result.filter(s =>
          s.profile?.display_name?.toLowerCase().includes(q) ||
          s.profile?.email?.toLowerCase().includes(q)
        );
      }
      return result;
    },
    placeholderData: keepPreviousData,
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['subscription_stats'],
    queryFn: async () => {
      const [active, total, revenue, monthly, yearly] = await Promise.all([
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('amount').eq('status', 'successful'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('plan_interval', 'monthly').eq('status', 'active'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('plan_interval', 'yearly').eq('status', 'active'),
      ]);
      return {
        active: active.count || 0,
        total: total.count || 0,
        revenue: revenue.data?.reduce((s, p) => s + (p.amount || 0), 0) || 0,
        monthly: monthly.count || 0,
        yearly: yearly.count || 0,
      };
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('user_id', userId);
      if (error) throw error;
      await supabase.from('profiles').update({ is_premium: false, premium_tier: null }).eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Subscription cancelled");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription_stats'] });
    },
    onError: () => toast.error("Failed to cancel subscription"),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('subscriptions').update({ status: 'active' }).eq('user_id', userId);
      if (error) throw error;
      await supabase.from('profiles').update({ is_premium: true }).eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Subscription reactivated");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription_stats'] });
    },
    onError: () => toast.error("Failed to reactivate"),
  });

  const grantPremiumMutation = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('subscriptions').upsert({
        user_id: userId, status: 'active', plan_interval: 'lifetime',
        current_period_start: new Date().toISOString(),
      });
      await supabase.from('profiles').update({ is_premium: true, premium_tier: 'admin_granted' }).eq('user_id', userId);
    },
    onSuccess: () => {
      toast.success("Lifetime premium granted");
      queryClient.invalidateQueries({ queryKey: ['admin_subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription_stats'] });
    },
    onError: () => toast.error("Failed to grant premium"),
  });

  const FILTERS: { label: string; value: typeof statusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Expired', value: 'expired' },
  ];

  return (
    <div className="space-y-5 pb-20 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Subscriptions</h2>
        <p className="text-sm text-muted-foreground">Manage premium plans, billing and lifetime grants.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Crown}        label="Active Subscribers" value={stats?.active  ?? '—'} sub={`${stats?.monthly ?? 0} monthly · ${stats?.yearly ?? 0} yearly`} color="text-yellow-500" />
        <StatTile icon={Users}        label="Total Subs"          value={stats?.total  ?? '—'} color="text-primary" />
        <StatTile icon={DollarSign}   label="Total Revenue"       value={stats ? `₦${stats.revenue.toLocaleString()}` : '—'} color="text-green-500" />
        <StatTile icon={Gift}         label="Churn Rate"
          value={stats && stats.total ? `${Math.round(((stats.total - stats.active) / stats.total) * 100)}%` : '—'}
          sub="cancelled / expired" color="text-red-400" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9" />
        </div>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <Button key={f.value} size="sm" variant={statusFilter === f.value ? 'default' : 'outline'}
              className="h-9 text-xs" onClick={() => { setStatusFilter(f.value); setPage(0); }}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden bg-background shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-32 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
              </TableCell></TableRow>
            ) : subscriptions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                No subscriptions found.
              </TableCell></TableRow>
            ) : subscriptions.map((sub) => (
              <TableRow key={sub.user_id} className="hover:bg-muted/20">
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{sub.profile?.display_name || 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">{sub.profile?.email || sub.user_id.slice(0, 8) + '…'}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {sub.plan_type && (
                      <p className="text-xs font-medium capitalize">{sub.plan_type.replace('_', ' ')}</p>
                    )}
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {sub.plan_interval || 'N/A'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell><StatusBadge status={sub.status} /></TableCell>
                <TableCell>
                  {sub.current_period_start ? (
                    <div>
                      <p className="text-sm">{format(new Date(sub.current_period_start), 'MMM d, yyyy')}</p>
                      {sub.current_period_end && (
                        <p className="text-[11px] text-muted-foreground">
                          → {format(new Date(sub.current_period_end), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ) : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell><ExpiryBadge end={sub.current_period_end} /></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {sub.status === 'active' ? (
                        <DropdownMenuItem className="text-red-600 focus:text-red-600"
                          onClick={() => cancelMutation.mutate(sub.user_id)}>
                          <XCircle className="mr-2 h-4 w-4" /> Cancel Subscription
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-green-600 focus:text-green-600"
                          onClick={() => reactivateMutation.mutate(sub.user_id)}>
                          <RefreshCw className="mr-2 h-4 w-4" /> Reactivate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => grantPremiumMutation.mutate(sub.user_id)}>
                        <Crown className="mr-2 h-4 w-4 text-yellow-500" /> Grant Lifetime Premium
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page + 1} · {subscriptions.length} results</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoading}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={subscriptions.length < pageSize || isLoading}>Next</Button>
        </div>
      </div>
    </div>
  );
}
