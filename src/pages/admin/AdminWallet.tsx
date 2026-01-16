import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowUpRight, ShieldCheck, History, TrendingUp, Wallet, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export default function AdminWallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Fetch Platform Wallet
  const { data: wallet } = useQuery({
    queryKey: ["admin-wallet", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_platform_wallet', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch recent transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ["admin-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch revenue stats
  const { data: stats } = useQuery({
    queryKey: ["admin-revenue-stats"],
    queryFn: async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      const [{ data: thisMonthData }, { data: lastMonthData }] = await Promise.all([
        supabase.from('transactions').select('amount').gte('created_at', thisMonth.toISOString()).eq('type', 'credit'),
        supabase.from('transactions').select('amount').gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()).eq('type', 'credit'),
      ]);
      
      const thisMonthTotal = thisMonthData?.reduce((acc, t) => acc + (t.amount || 0), 0) || 0;
      const lastMonthTotal = lastMonthData?.reduce((acc, t) => acc + (t.amount || 0), 0) || 0;
      
      return { thisMonth: thisMonthTotal, lastMonth: lastMonthTotal };
    },
  });

  const handleWithdraw = async () => {
    if (!wallet || wallet.balance <= 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-payout', {
        body: { amount: wallet.balance }
      });
      if (error) throw error;
      toast.success("Admin withdrawal initiated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-wallet"] });
    } catch (e: any) {
      toast.error("Withdrawal failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">Platform Revenue</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Main Balance Card */}
        <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-0 shadow-xl md:col-span-2">
          <CardContent className="p-6">
            <p className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">
              Platform Balance
            </p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold">
                ₦{(wallet?.balance || 0).toLocaleString()}
              </span>
              <span className="text-sm text-gray-400">.00</span>
            </div>
            
            <Button 
              onClick={handleWithdraw}
              disabled={loading || !wallet || wallet.balance <= 0}
              className="w-full bg-white text-black hover:bg-gray-200 font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <ArrowUpRight className="w-4 h-4 mr-2"/>}
              Withdraw to Admin Bank
            </Button>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" /> This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₦{(stats?.thisMonth || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Last Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{(stats?.lastMonth || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Badge variant={tx.type === 'credit' ? 'default' : 'secondary'} className={tx.type === 'credit' ? 'bg-green-500' : ''}>
                        {tx.type === 'credit' ? <ArrowDownLeft className="w-3 h-3 mr-1" /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{tx.category?.replace('_', ' ') || '-'}</TableCell>
                    <TableCell className={tx.type === 'credit' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {tx.type === 'credit' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}
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
