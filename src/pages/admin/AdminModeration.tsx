import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  AlertTriangle, CheckCircle, Ban, Calendar, Loader2,
  Trash2, ShieldAlert, User, Flag, Clock, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type Report = {
  id: string;
  target_id: string;
  target_type: 'user' | 'event';
  reason: string | null;
  created_at: string | null;
  reporter_id: string | null;
  status: string;
};

type UserContent = {
  _kind: 'user';
  avatar_url: string | null;
  display_name: string | null;
  bio: string | null;
  is_banned: boolean | null;
};

type EventContent = {
  _kind: 'event';
  title: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
};

type ContentData = UserContent | EventContent | null;

// ── Content Preview ────────────────────────────────────────────────────────────
const ContentPreview = ({ type, id }: { type: 'user' | 'event'; id: string }) => {
  const { data, isLoading } = useQuery<ContentData>({
    queryKey: ['content_preview', type, id],
    queryFn: async () => {
      if (type === 'user') {
        const { data } = await supabase.from('profiles')
          .select('avatar_url, display_name, bio, is_banned').eq('user_id', id).maybeSingle();
        if (!data) return null;
        return { ...data, _kind: 'user' as const };
      } else {
        const { data: ev } = await supabase.from('events')
          .select('title, description, image_url').eq('id', id).maybeSingle();
        if (!ev) return null;
        const { data: loc } = await supabase.from('event_locations')
          .select('location_name').eq('event_id', id).maybeSingle();
        return { ...ev, location: loc?.location_name || null, _kind: 'event' as const };
      }
    },
  });

  if (isLoading) return <div className="flex items-center gap-2 p-3 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading content...</div>;
  if (!data) return <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg">Content already deleted or not found.</div>;

  if (data._kind === 'user') return (
    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
      <Avatar className="w-12 h-12 border">
        <AvatarImage src={data.avatar_url || undefined} />
        <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{data.display_name || 'Unknown User'}</p>
        <p className="text-xs text-muted-foreground truncate">{data.bio || 'No bio'}</p>
        <Badge variant={data.is_banned ? 'destructive' : 'outline'} className="text-[9px] mt-1">
          {data.is_banned ? 'Already Banned' : 'Active'}
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="p-3 bg-muted/40 rounded-xl space-y-2">
      {data.image_url && (
        <img src={data.image_url} alt="Event" className="w-full h-32 object-cover rounded-lg" />
      )}
      <div className="flex items-start gap-2">
        <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">{(data as EventContent).title}</p>
          <p className="text-xs text-muted-foreground">{(data as EventContent).location || 'No location'}</p>
        </div>
      </div>
      {(data as EventContent).description && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-primary pl-2 line-clamp-2">
          {(data as EventContent).description}
        </p>
      )}
    </div>
  );
};

// ── Report Card ────────────────────────────────────────────────────────────────
const ReportCard = ({ report, onDismiss, onPunish, isPunishing, isDismissing }: {
  report: Report;
  onDismiss: (id: string) => void;
  onPunish: (r: Report) => void;
  isPunishing: boolean;
  isDismissing: boolean;
}) => (
  <Card className="border-l-4 border-l-red-500 shadow-sm overflow-hidden">
    <CardHeader className="py-3 px-4 flex-row items-center justify-between bg-muted/20">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={report.target_type === 'user' ? 'default' : 'secondary'} className="text-[10px]">
          {report.target_type === 'user' ? <User className="w-2.5 h-2.5 mr-1" /> : <Calendar className="w-2.5 h-2.5 mr-1" />}
          {report.target_type.toUpperCase()}
        </Badge>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {report.created_at ? formatDistanceToNow(new Date(report.created_at), { addSuffix: true }) : 'Unknown'}
        </span>
      </div>
      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
    </CardHeader>
    <CardContent className="px-4 py-3 space-y-3">
      <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/20 rounded-lg p-2.5">
        <Flag className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-red-700 dark:text-red-300">
          "{report.reason || 'No reason provided'}"
        </p>
      </div>
      <ContentPreview type={report.target_type} id={report.target_id} />
    </CardContent>
    <CardFooter className="px-4 py-3 flex justify-end gap-2 border-t bg-muted/10">
      <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5"
        onClick={() => onDismiss(report.id)} disabled={isDismissing}>
        {isDismissing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
        Dismiss
      </Button>
      <Button size="sm" variant="destructive" className="text-xs h-8 gap-1.5"
        onClick={() => onPunish(report)} disabled={isPunishing}>
        {isPunishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
          report.target_type === 'user'
            ? <><Ban className="w-3.5 h-3.5" /> Ban User</>
            : <><Trash2 className="w-3.5 h-3.5" /> Delete Event</>
        )}
      </Button>
    </CardFooter>
  </Card>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminModeration() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ['admin_reports', tab],
    queryFn: async () => {
      const status = tab === 'pending' ? 'pending' : ['dismissed', 'resolved'];
      let q = supabase.from('reports').select('*').order('created_at', { ascending: true });
      q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(r => ({ ...r, target_type: r.target_type as 'user' | 'event' }));
    },
  });

  // Stats
  const { data: counts } = useQuery({
    queryKey: ['moderation_counts'],
    queryFn: async () => {
      const [pending, resolved, banned] = await Promise.all([
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).in('status', ['dismissed', 'resolved']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
      ]);
      return { pending: pending.count || 0, resolved: resolved.count || 0, banned: banned.count || 0 };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.from('reports').update({ status: 'dismissed' }).eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report dismissed");
      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
      queryClient.invalidateQueries({ queryKey: ['moderation_counts'] });
    },
  });

  const punishMutation = useMutation({
    mutationFn: async ({ reportId, targetId, type }: { reportId: string; targetId: string; type: 'user' | 'event' }) => {
      if (type === 'user') {
        await supabase.from('profiles').update({ is_banned: true }).eq('user_id', targetId);
      } else {
        await supabase.from('events').delete().eq('id', targetId);
      }
      await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    },
    onSuccess: (_, { type }) => {
      toast.success(type === 'user' ? "User banned" : "Event deleted");
      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
      queryClient.invalidateQueries({ queryKey: ['moderation_counts'] });
    },
    onError: () => toast.error("Action failed"),
  });

  return (
    <div className="space-y-5 pb-20 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-500" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Moderation</h2>
          <p className="text-sm text-muted-foreground">Review reports, ban users, remove harmful content.</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending Reports', value: counts?.pending ?? '—', icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Resolved', value: counts?.resolved ?? '—', icon: CheckCircle2, color: 'text-green-500' },
          { label: 'Banned Users', value: counts?.banned ?? '—', icon: Ban, color: 'text-muted-foreground' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-2 w-64">
          <TabsTrigger value="pending" className="text-xs gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pending {counts?.pending ? `(${counts.pending})` : ''}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Resolved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <CheckCircle className="w-14 h-14 text-green-500 mb-3" />
                <h3 className="text-lg font-semibold">All clear!</h3>
                <p className="text-sm text-muted-foreground">No pending reports to review.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {reports.map(report => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onDismiss={(id) => resolveMutation.mutate(id)}
                  onPunish={(r) => punishMutation.mutate({ reportId: r.id, targetId: r.target_id, type: r.target_type })}
                  isDismissing={resolveMutation.isPending && resolveMutation.variables === report.id}
                  isPunishing={punishMutation.isPending && (punishMutation.variables as any)?.reportId === report.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <CheckCircle2 className="w-14 h-14 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No resolved reports yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
                  <Badge variant={report.status === 'resolved' ? 'destructive' : 'secondary'} className="text-[9px] shrink-0 mt-0.5">
                    {report.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {report.target_type.toUpperCase()} — {report.reason || 'No reason'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {report.created_at ? formatDistanceToNow(new Date(report.created_at), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
