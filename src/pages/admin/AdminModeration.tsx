import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertTriangle, CheckCircle, Ban, Calendar, Loader2, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

// --- Types ---
type Report = {
  id: string;
  target_id: string;
  target_type: 'user' | 'event';
  reason: string | null;
  created_at: string | null;
  reporter_id: string | null;
};

type UserContent = {
  _kind: 'user';
  avatar_url: string | null;
  display_name: string | null;
  bio: string | null;
  is_banned: boolean | null;
  role: string | null;
};

type EventContent = {
  _kind: 'event';
  title: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
};

type ContentData = UserContent | EventContent | null;

// --- Sub-Component: Fetches & Displays the Accused Content ---
const ContentPreview = ({ type, id }: { type: 'user' | 'event', id: string }) => {
  const { data, isLoading } = useQuery<ContentData>({
    queryKey: ['content_preview', type, id],
    queryFn: async () => {
      if (type === 'user') {
        const { data } = await supabase.from('profiles').select('avatar_url, display_name, bio, is_banned').eq('user_id', id).maybeSingle();
        if (!data) return null;
        return { ...data, _kind: 'user' as const, role: null };
      } else {
        const { data } = await supabase.from('events').select('title, location, description, image_url').eq('id', id).maybeSingle();
        if (!data) return null;
        return { ...data, _kind: 'event' as const };
      }
    }
  });

  if (isLoading) return <div className="p-4"><Loader2 className="animate-spin w-5 h-5" /></div>;
  if (!data) return <div className="p-4 text-red-500">Content already deleted or not found.</div>;

  if (data._kind === 'user') {
    return (
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <Avatar className="w-16 h-16">
          <AvatarImage src={data.avatar_url || undefined} />
          <AvatarFallback>User</AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-bold text-lg">{data.display_name || 'Unknown User'}</h3>
          <p className="text-sm text-muted-foreground">{data.bio || "No bio provided."}</p>
          <div className="flex gap-2 mt-2">
             <Badge variant="outline">{data.is_banned ? 'Already Banned' : 'Active Status'}</Badge>
             <Badge>{data.role || 'user'}</Badge>
          </div>
        </div>
      </div>
    );
  }

  if (data._kind === 'event') {
    return (
      <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 p-2 rounded-md">
            <Calendar className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{data.title}</h3>
            <p className="text-sm text-muted-foreground">{data.location || 'No location'}</p>
          </div>
        </div>
        <p className="text-sm italic border-l-2 border-primary pl-2">{data.description || 'No description'}</p>
        {data.image_url && (
          <img src={data.image_url} alt="Event" className="w-full h-40 object-cover rounded-md" />
        )}
      </div>
    );
  }
  return null;
};

export default function AdminModeration() {
  const queryClient = useQueryClient();

  // 1. Fetch Pending Reports
  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ['admin_reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map(r => ({
        ...r,
        target_type: r.target_type as 'user' | 'event'
      }));
    }
  });

  // 2. Action: Resolve (Ignore/Keep)
  const resolveMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('reports')
        .update({ status: 'dismissed' })
        .eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report dismissed");
      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
    }
  });

  // 3. Action: Punish (Ban User / Delete Event)
  const punishMutation = useMutation({
    mutationFn: async ({ reportId, targetId, type }: { reportId: string, targetId: string, type: 'user' | 'event' }) => {
      // A. Perform the punishment
      if (type === 'user') {
        await supabase.from('profiles').update({ is_banned: true }).eq('user_id', targetId);
      } else {
        await supabase.from('events').delete().eq('id', targetId);
      }

      // B. Mark report as resolved
      await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    },
    onSuccess: (_, variables) => {
      toast.success(variables.type === 'user' ? "User banned successfully" : "Event deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
    },
    onError: () => toast.error("Failed to apply punishment")
  });

  if (isLoading) return <div className="p-8"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          Moderation Queue
        </h2>
        <p className="text-muted-foreground">
          Review reported content. {reports.length} pending reports.
        </p>
      </div>

      {reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold">All Clean!</h3>
            <p className="text-muted-foreground">There are no pending reports to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {reports.map((report) => (
            <Card key={report.id} className="border-l-4 border-l-red-500 shadow-md">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Badge variant={report.target_type === 'user' ? 'default' : 'secondary'}>
                      {report.target_type.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Reported {report.created_at ? new Date(report.created_at).toLocaleDateString() : 'Unknown date'}
                    </span>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <CardTitle className="text-base font-medium pt-2">
                  Reason: "{report.reason || 'No reason provided'}"
                </CardTitle>
              </CardHeader>
              
              <CardContent className="pb-2">
                <ContentPreview type={report.target_type} id={report.target_id} />
              </CardContent>

              <CardFooter className="flex justify-end gap-3 pt-4 bg-muted/20">
                <Button 
                  variant="outline" 
                  onClick={() => resolveMutation.mutate(report.id)}
                >
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  Keep / Dismiss
                </Button>
                
                <Button 
                  variant="destructive"
                  onClick={() => punishMutation.mutate({ 
                    reportId: report.id, 
                    targetId: report.target_id, 
                    type: report.target_type 
                  })}
                >
                  {report.target_type === 'user' ? (
                    <>
                      <Ban className="w-4 h-4 mr-2" /> Ban User
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Event
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
