import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, UserPlus, Calendar, Loader2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// --- Types ---
type NotificationItem = {
  id: string;
  type: 'friend_request' | 'event_invite';
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  event_id?: string;
  event_title?: string;
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Build notifications from friendships (pending requests) and event invitations
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!user) return [];
      
      const items: NotificationItem[] = [];

      // Get pending friend requests (incoming)
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
          items.push({
            id: req.id,
            type: 'friend_request',
            created_at: req.created_at,
            sender_id: req.requester_id,
            sender_name: req.requester?.display_name || 'Someone',
            sender_avatar: req.requester?.avatar_url
          });
        });
      }

      // Get pending event invitations
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

      // Sort by date
      return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user,
  });

  // Accept friend request
  const acceptFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase
        .from("friendships")
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq("id", friendshipId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend request accepted!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => toast.error("Failed to accept request")
  });

  // Decline friend request
  const declineFriendMutation = useMutation({
    mutationFn: async ({ friendshipId }: { friendshipId: string }) => {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info("Request declined");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to decline request")
  });

  // Accept event invite
  const acceptEventMutation = useMutation({
    mutationFn: async ({ invitationId, eventId }: { invitationId: string; eventId: string }) => {
      // Update invitation status
      await supabase
        .from("event_invitations")
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq("id", invitationId);

      // Add as attendee
      await supabase
        .from("event_attendees")
        .insert({ event_id: eventId, user_id: user?.id, status: 'confirmed' });
    },
    onSuccess: () => {
      toast.success("You're going to the event!");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to accept invitation")
  });

  // Decline event invite
  const declineEventMutation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      await supabase
        .from("event_invitations")
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq("id", invitationId);
    },
    onSuccess: () => {
      toast.info("Invitation declined");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to decline invitation")
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'event_invite':
        return <Calendar className="w-4 h-4 text-green-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getMessage = (item: NotificationItem) => {
    switch (item.type) {
      case 'friend_request':
        return `${item.sender_name} sent you a friend request`;
      case 'event_invite':
        return `${item.sender_name} invited you to ${item.event_title}`;
      default:
        return 'New notification';
    }
  };

  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {notifications.length} pending
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">You're all caught up!</p>
            <p className="text-sm text-muted-foreground/70 mt-1">No pending notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={item.sender_avatar} />
                    <AvatarFallback>{item.sender_name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getIcon(item.type)}
                      <span className="text-sm font-medium truncate">{getMessage(item)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {item.type === 'friend_request' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => declineFriendMutation.mutate({ friendshipId: item.id })}
                          disabled={declineFriendMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => acceptFriendMutation.mutate({ friendshipId: item.id })}
                          disabled={acceptFriendMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {item.type === 'event_invite' && item.event_id && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => declineEventMutation.mutate({ invitationId: item.id })}
                          disabled={declineEventMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => acceptEventMutation.mutate({ invitationId: item.id, eventId: item.event_id! })}
                          disabled={acceptEventMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </>
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
