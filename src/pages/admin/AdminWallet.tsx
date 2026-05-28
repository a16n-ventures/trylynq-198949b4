import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Loader2, ArrowUpRight, ShieldCheck, History, 
  TrendingUp, Wallet, ArrowDownLeft, DollarSign, 
  ArrowUp, ArrowDown, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => `₦${n.toLocaleString()}`;

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

export default function AdminWallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [withdrawing, setWithdrawing] = useState(false);
  const [txFilter, setTxFilter] = useState<'all' | 'credit' | 'debit'>('all');

  // ── Platform wallet ────────────────────────────────────────────────────────
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['admin-wallet', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets').select('*').eq('is_platform_wallet', true).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ── Transactions ───────────────────────────────────────────────────────────
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['admin-transactions', txFilter],
    queryFn: async () => {
      let q = supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(50);
      if (txFilter !== 'all') q = q.eq('type', txFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ── Revenue stats ──────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['admin-revenue-stats'],
    queryFn: async () => {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const [thisMonth, lastMonth, totalCredits, totalDebits, pendingPayouts] = await Promise.all([
        supabase.from('transactions').select('amount').gte('created_at', thisMonthStart.toISOString()).eq('type', 'credit'),
        supabase.from('transactions').select('amount').gte('created_at', lastMonthStart.toISOString()).lt('created_at', thisMonthStart.toISOString()).eq('type', 'credit'),
        supabase.from('transactions').select('amount').eq('type', 'credit'),
        supabase.from('transactions').select('amount').eq('type', 'debit'),
        supabase.from('payout_requests').select('amount').eq('status', 'pending'),
      ]);

      const sum = (rows: any[]) => rows?.reduce((acc, r) => acc + (r.amount || 0), 0) || 0;

      return {
        thisMonth:      sum(thisMonth.data || []),
        lastMonth:      sum(lastMonth.data || []),
        totalCredits:   sum(totalCredits.data || []),
        totalDebits:    sum(totalDebits.data || []),
        pendingPayouts: sum(pendingPayouts.data || []),
        growth: lastMonth.data?.length
          ? Math.round(((sum(thisMonth.data || []) - sum(lastMonth.data || [])) / Math.max(sum(lastMonth.data || []), 1)) * 100)
          : 0,
      };
    },
  });

  const handleWithdraw = async () => {
    if (!wallet || wallet.balance <= 0) return;
    setWithdrawing(true);
    try {
      const { error } = await supabase.functions.invoke('request-payout', {
        body: { amount: wallet.balance },
      });
      if (error) throw error;
      toast.success("Withdrawal initiated successfully");
      queryClient.invalidateQueries({ queryKey: ['admin-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
    } catch (e: any) {
      toast.error("Withdrawal failed: " + e.message);
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-5 pb-20 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-purple-500" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Platform Revenue</h2>
          <p className="text-sm text-muted-foreground">Platform wallet, earnings and transaction history.</p>
        </div>
      </div>

      {/* Balance hero + stats row */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Balance card */}
        <Card className="md:col-span-1 border-0 shadow-xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
          <CardContent className="p-5 flex flex-col h-full justify-between text-white">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/50 mb-1">Platform Balance</p>
              {walletLoading
                ? <div className="h-10 w-32 bg-white/10 rounded-lg animate-pulse mt-1" />
                : <p className="text-4xl font-black">{fmt(wallet?.balance || 0)}</p>
              }
              {stats && (
                <div className="flex items-center gap-1.5 mt-2">
                  {stats.growth >= 0
                    ? <ArrowUp className="w-3.5 h-3.5 text-green-400" />
                    : <ArrowDown className="w-3.5 h-3.5 text-red-400" />}
                  <span className={`text-xs font-semibold ${stats.growth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Math.abs(stats.growth)}% vs last month
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing || !wallet || wallet.balance <= 0}
              className="mt-5 w-full bg-white text-black hover:bg-gray-100 font-semibold h-10"
            >
              {withdrawing
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing…</>
                : <><ArrowUpRight className="w-4 h-4 mr-2" /> Withdraw to Bank</>}
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <StatTile icon={TrendingUp}  label="This Month"       value={stats ? fmt(stats.thisMonth)    : '—'} color="text-green-500"
            sub={stats?.lastMonth ? `vs ${fmt(stats.lastMonth)} last month` : undefined} />
          <StatTile icon={DollarSign}  label="Total Credits"    value={stats ? fmt(stats.totalCredits)  : '—'} color="text-blue-500" />
          <StatTile icon={ArrowUpRight} label="Total Paid Out"  value={stats ? fmt(stats.totalDebits)   : '—'} color="text-orange-400" />
          <StatTile icon={Wallet}       label="Pending Payouts" value={stats ? fmt(stats.pendingPayouts): '—'} color="text-yellow-500"
            sub="awaiting approval" />
        </div>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" /> Transactions
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {(['all', 'credit', 'debit'] as const).map(f => (
                  <Button key={f} size="sm" variant={txFilter === f ? 'default' : 'outline'}
                    className="h-7 text-xs capitalize" onClick={() => setTxFilter(f)}>
                    {f}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-transactions'] })}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">No transactions found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => (
                  <TableRow key={tx.id} className="hover:bg-muted/20">
                    <TableCell>
                      <Badge className={`border-0 text-[10px] gap-1 ${tx.type === 'credit' ? 'bg-green-500 text-white' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                        {tx.type === 'credit'
                          ? <ArrowDownLeft className="w-2.5 h-2.5" />
                          : <ArrowUpRight className="w-2.5 h-2.5" />}
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-sm">
                      {tx.category?.replace(/_/g, ' ') || '—'}
                    </TableCell>
                    <TableCell className={`font-semibold text-sm ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'credit' ? '+' : '−'}{fmt(tx.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {tx.reference ? tx.reference.slice(0, 12) + '…' : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tx.created_at), 'MMM d, yyyy · HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
