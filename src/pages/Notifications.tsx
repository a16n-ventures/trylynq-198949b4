import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, UserPlus, Calendar, Loader2, Check, X, MessageSquare, MapPin, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// --- Types ---
type NotificationItem = {
  id: string;
  type: 'friend_request' | 'event_invite' | 'message' | 'location_share' | 'story_reply';
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  event_id?: string;
  event_title?: string;
  message_preview?: string;
  share_id?: string; // For location share
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Build notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!user) return [];
      
      const items: NotificationItem[] = [];

      // 1. Friend Requests
      // We try two common patterns for alias to be safe against schema variations
      const { data: friendRequests } = await supabase
        .from("friendships")
        .select(`
          id, created_at, requester_id,
          requester:profiles!requester_id (display_name, avatar_url)
        `)
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (friendRequests) {
        friendRequests.forEach((req: any) => {
          // Robust check if requester object exists
          if (req.requester) {
             items.push({
                id: req.id,
                type: 'friend_request',
                created_at: req.created_at,
                sender_id: req.requester_id,
                sender_name: req.requester.display_name || 'Someone',
                sender_avatar: req.requester.avatar_url
             });
          }
        });
      }

      // 2. Event Invitations
      const { data: eventInvites } = await supabase
        .from("event_invitations")
        .select(`
          id, created_at, inviter_id, event_id,
          inviter:profiles!inviter_id (display_name, avatar_url),
          event:events!event_id (title)
        `)
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (eventInvites) {
        eventInvites.forEach((inv: any) => {
          items.push({
            id: inv.id,
            type: 'event_invite',
            created_at: inv.created_at,
            sender_id: inv.inviter_id,
            sender_name: inv.inviter?.display_name || 'Someone',
            sender_avatar: inv.inviter?.avatar_url,
            event_id: inv.event_id,
            event_title: inv.event?.title || 'an event'
          });
        });
      }

      // 3. Location Shares
      const { data: locationShares } = await supabase
        .from("location_shares")
        .select(`
          id, created_at, sharer_id, expires_at,
          sharer:profiles!sharer_id (display_name, avatar_url)
        `)
        .eq("recipient_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (locationShares) {
        locationShares.forEach((share: any) => {
          items.push({
            id: share.id,
            type: 'location_share',
            created_at: share.created_at,
            sender_id: share.sharer_id,
            sender_name: share.sharer?.display_name || 'Someone',
            sender_avatar: share.sharer?.avatar_url,
            share_id: share.id
          });
        });
      }

      // 4. Story Replies (Messages that look like story replies)
      const { data: messages } = await supabase
        .from("messages")
        .select(`
           id, created_at, sender_id, content, is_read,
           sender:profiles!sender_id (display_name, avatar_url)
        `)
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .ilike("content", "Replied to story:%") // Filter specifically for story replies
        .order("created_at", { ascending: false });

      if (messages) {
         messages.forEach((msg: any) => {
            items.push({
               id: msg.id,
               type: 'story_reply',
               created_at: msg.created_at,
               sender_id: msg.sender_id,
               sender_name: msg.sender?.display_name || 'User',
               sender_avatar: msg.sender?.avatar_url,
               message_preview: msg.content.replace('Replied to story:', '').trim()
            });
         });
      }

      return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user,
  });

  // --- Real-time Logic ---
  useEffect(() => {
    if (!user) return;
    const changes = supabase.channel('global-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, () => {
         queryClient.invalidateQueries({ queryKey: ['notifications'] });
         toast.info("Friend list updated");
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, (payload: any) => {
         // Only toast if it looks like a story reply
         if (payload.new.content && payload.new.content.includes("Replied to story")) {
             toast.info("New story reply!");
             queryClient.invalidateQueries({ queryKey: ['notifications'] });
         }
      })
      .subscribe();

    return () => { supabase.removeChannel(changes); };
  }, [user, queryClient]);

  // --- Mutations ---
  const acceptFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase.from("friendships").update({ status: 'accepted', updated_at: new Date().toISOString() }).eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend request accepted!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to accept request")
  });

  const declineFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info("Request declined");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to decline request")
  });

  const acceptEventMutation = useMutation({
    mutationFn: async ({ invitationId, eventId }: { invitationId: string; eventId: string }) => {
      await supabase.from("event_invitations").update({ status: 'accepted', updated_at: new Date().toISOString() }).eq("id", invitationId);
      await supabase.from("event_attendees").insert({ event_id: eventId, user_id: user?.id, status: 'confirmed' });
    },
    onSuccess: () => {
      toast.success("You're going to the event!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const dismissLocationShare = useMutation({
    mutationFn: async ({ shareId }: { shareId: string }) => {
      await supabase.from("location_shares").update({ is_active: false }).eq("id", shareId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request': return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'event_invite': return <Calendar className="w-4 h-4 text-green-500" />;
      case 'story_reply': return <Reply className="w-4 h-4 text-pink-500" />;
      case 'location_share': return <MapPin className="w-4 h-4 text-amber-500" />;
      default: return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getMessage = (item: NotificationItem) => {
    switch (item.type) {
      case 'friend_request': return `${item.sender_name} sent you a friend request`;
      case 'event_invite': return `${item.sender_name} invited you to ${item.event_title}`;
      case 'story_reply': return `Replying to your story: "${item.message_preview}"`;
      case 'location_share': return `${item.sender_name} is sharing their location`;
      default: return 'New notification';
    }
  };

  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.length > 0 && <span className="text-sm text-muted-foreground">{notifications.length} pending</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : notifications.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center"><Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">You're all caught up!</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10"><AvatarImage src={item.sender_avatar} /><AvatarFallback>{item.sender_name[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">{getIcon(item.type)}<span className="text-sm font-medium truncate">{item.sender_name}</span></div>
                    <p className="text-sm text-foreground mb-1">{getMessage(item).replace(`${item.sender_name} `, '')}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {item.type === 'friend_request' && (
                      <>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" onClick={() => declineFriendMutation.mutate({ friendshipId: item.id })}><X className="w-4 h-4" /></Button>
                        <Button size="sm" className="h-8 w-8 p-0" onClick={() => acceptFriendMutation.mutate({ friendshipId: item.id })}><Check className="w-4 h-4" /></Button>
                      </>
                    )}
                    {item.type === 'event_invite' && item.event_id && (
                      <Button size="sm" className="h-8 w-8 p-0" onClick={() => acceptEventMutation.mutate({ invitationId: item.id, eventId: item.event_id! })}><Check className="w-4 h-4" /></Button>
                    )}
                    {item.type === 'story_reply' && (
                       <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={() => navigate(`/app/messages?userId=${item.sender_id}`)}>Reply</Button>
                    )}
                    {item.type === 'location_share' && item.share_id && (
                       <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => dismissLocationShare.mutate({ shareId: item.share_id! })}><X className="w-4 h-4" /></Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
