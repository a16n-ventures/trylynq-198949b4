import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, UserPlus, Calendar, Loader2, Check, X, MessageSquare, MapPin, Reply, Navigation, Clock, Trash2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

// --- Types ---
type NotificationType = 'nearby_user' | 'friend_request' | 'event_invite' | 'message' | 'location_share' | 'story_reply' | 'rsvp' | 'payment' | 'event_update';

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  sender_id: string | null;
  sender_name?: string;
  sender_avatar?: string;
  metadata?: {
    distance_km?: number;
    avatar_url?: string;
    timestamp?: string;
    event_id?: string;
    event_title?: string;
  };
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markAsRead } = useRealtimeNotifications(user?.id);

  // Fetch all notifications from the new table + legacy sources
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!user) return [];
      
      const items: NotificationItem[] = [];
      const userIdsToFetch = new Set<string>();
      const eventIdsToFetch = new Set<string>();

      // 1. Fetch from new notifications table
      const { data: dbNotifications } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dbNotifications) {
        dbNotifications.forEach(n => {
          if (n.sender_id) userIdsToFetch.add(n.sender_id);
        });
      }

      // 2. Fetch legacy sources (for backwards compatibility)
      // A. Friend Requests
      const { data: friendRequests } = await supabase
        .from("friendships")
        .select("id, created_at, requester_id")
        .eq("addressee_id", user.id)
        .eq("status", "pending");

      friendRequests?.forEach(r => userIdsToFetch.add(r.requester_id));

      // B. Event Invites
      const { data: eventInvites } = await supabase
        .from("event_invitations")
        .select("id, created_at, inviter_id, event_id")
        .eq("invitee_id", user.id)
        .eq("status", "pending");
      
      eventInvites?.forEach(i => {
        userIdsToFetch.add(i.inviter_id);
        if (i.event_id) eventIdsToFetch.add(i.event_id);
      });

      // C. Location Shares
      const { data: locationShares } = await supabase
        .from("location_shares")
        .select("id, created_at, sharer_id, expires_at")
        .eq("recipient_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString());

      locationShares?.forEach(s => userIdsToFetch.add(s.sharer_id));

      // D. Story Replies
      const { data: messages } = await supabase
        .from("messages")
        .select("id, created_at, sender_id, content")
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .ilike("content", "Replied to story:%");

      messages?.forEach(m => userIdsToFetch.add(m.sender_id));

      // 3. Bulk fetch profiles & events
      const profileMap = new Map();
      const eventMap = new Map();

      if (userIdsToFetch.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", Array.from(userIdsToFetch));
        
        profiles?.forEach(p => profileMap.set(p.user_id, p));
      }

      if (eventIdsToFetch.size > 0) {
        const { data: events } = await supabase
          .from("events")
          .select("id, title")
          .in("id", Array.from(eventIdsToFetch));
        
        events?.forEach(e => eventMap.set(e.id, e));
      }

      // 4. Process database notifications
      dbNotifications?.forEach(n => {
        const profile = n.sender_id ? profileMap.get(n.sender_id) : null;
        const metadata = n.metadata as NotificationItem['metadata'] || {};
        
        items.push({
          id: n.id,
          type: n.type as NotificationType,
          title: n.title,
          message: n.message,
          created_at: n.created_at,
          is_read: n.is_read,
          sender_id: n.sender_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: metadata?.avatar_url || profile?.avatar_url,
          metadata: metadata
        });
      });

      // 5. Process legacy Friend Requests (only if not already in notifications)
      const existingIds = new Set(items.map(i => i.id));
      
      friendRequests?.forEach((req: any) => {
        if (existingIds.has(req.id)) return;
        const profile = profileMap.get(req.requester_id);
        items.push({
          id: req.id,
          type: 'friend_request',
          title: 'Friend Request',
          message: `${profile?.display_name || 'Someone'} sent you a friend request`,
          created_at: req.created_at,
          is_read: false,
          sender_id: req.requester_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url
        });
      });

      // Process Event Invites
      eventInvites?.forEach((inv: any) => {
        if (existingIds.has(inv.id)) return;
        const profile = profileMap.get(inv.inviter_id);
        const event = eventMap.get(inv.event_id);
        items.push({
          id: inv.id,
          type: 'event_invite',
          title: 'Event Invitation',
          message: `${profile?.display_name || 'Someone'} invited you to ${event?.title || 'an event'}`,
          created_at: inv.created_at,
          is_read: false,
          sender_id: inv.inviter_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url,
          metadata: { event_id: inv.event_id, event_title: event?.title }
        });
      });

      // Process Location Shares
      locationShares?.forEach((share: any) => {
        if (existingIds.has(share.id)) return;
        const profile = profileMap.get(share.sharer_id);
        items.push({
          id: share.id,
          type: 'location_share',
          title: 'Location Shared',
          message: `${profile?.display_name || 'Someone'} is sharing their location with you`,
          created_at: share.created_at,
          is_read: false,
          sender_id: share.sharer_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url
        });
      });

      // Process Story Replies
      messages?.forEach((msg: any) => {
        if (existingIds.has(msg.id)) return;
        const profile = profileMap.get(msg.sender_id);
        items.push({
          id: msg.id,
          type: 'story_reply',
          title: 'Story Reply',
          message: msg.content.replace('Replied to story:', '').trim(),
          created_at: msg.created_at,
          is_read: false,
          sender_id: msg.sender_id,
          sender_name: profile?.display_name || 'Unknown User',
          sender_avatar: profile?.avatar_url
        });
      });

      // Sort by date (newest first)
      return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user,
  });

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const channels = [
      supabase.channel('notifications-updates')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'notifications', 
          filter: `user_id=eq.${user.id}` 
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        })
        .subscribe(),

      supabase.channel('friendships-notif')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'friendships', 
          filter: `addressee_id=eq.${user.id}` 
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        })
        .subscribe(),

      supabase.channel('invites-notif')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'event_invitations', 
          filter: `invitee_id=eq.${user.id}` 
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        })
        .subscribe(),

      supabase.channel('rsvp-notif')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'event_attendees',
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        })
        .subscribe()
    ];

    return () => {
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, [user, queryClient]);

  // --- Mutations ---
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

  const acceptEventMutation = useMutation({
    mutationFn: async ({ invitationId, eventId }: { invitationId: string; eventId: string }) => {
      await supabase
        .from("event_invitations")
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq("id", invitationId);

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

  const dismissNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      // Try to delete from notifications table first
      const { error: notifError } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);
      
      // If it's a location share, deactivate it
      if (notifError) {
        await supabase
          .from("location_shares")
          .update({ is_active: false })
          .eq("id", notificationId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'event_invite':
        return <Calendar className="w-4 h-4 text-green-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'story_reply':
        return <Reply className="w-4 h-4 text-pink-500" />;
      case 'location_share':
        return <MapPin className="w-4 h-4 text-amber-500" />;
      case 'nearby_user':
        return <Navigation className="w-4 h-4 text-emerald-500" />;
      case 'rsvp':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'payment':
        return <Bell className="w-4 h-4 text-primary" />;
      case 'event_update':
        return <Calendar className="w-4 h-4 text-blue-600" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  const renderNotificationCard = (item: NotificationItem) => (
    <Card 
      key={item.id} 
      className={`hover:shadow-md transition-all ${!item.is_read ? 'bg-primary/5 border-primary/20' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="w-12 h-12">
              <AvatarImage src={item.sender_avatar} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {item.sender_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            {item.type === 'nearby_user' && (
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 border-2 border-background">
                <Navigation className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getIcon(item.type)}
              <span className="text-sm font-semibold truncate">{item.sender_name}</span>
              {!item.is_read && (
                <Badge variant="default" className="h-5 text-[10px] px-1.5 bg-primary/20 text-primary border-0">
                  New
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-foreground mb-1">
              {item.type === 'nearby_user' ? (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-emerald-600">Nearby!</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{item.message}</span>
                </span>
              ) : item.type === 'story_reply' ? (
                <>
                  <span className="text-muted-foreground">Replied: </span>
                  "{item.message}"
                </>
              ) : (
                item.message
              )}
            </p>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
              {item.type === 'nearby_user' && item.metadata?.distance_km && (
                <>
                  <span>•</span>
                  <span className="text-emerald-600 font-medium">
                    {item.metadata.distance_km < 1 
                      ? `${Math.round(item.metadata.distance_km * 1000)}m away`
                      : `${item.metadata.distance_km.toFixed(1)}km away`
                    }
                  </span>
                </>
              )}
            </div>
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
            {item.type === 'event_invite' && item.metadata?.event_id && (
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
                  onClick={() => acceptEventMutation.mutate({ invitationId: item.id, eventId: item.metadata!.event_id! })}
                  disabled={acceptEventMutation.isPending}
                >
                  <Check className="w-4 h-4" />
                </Button>
              </>
            )}
            {item.type === 'story_reply' && (
              <Button 
                size="sm" 
                variant="secondary" 
                className="h-8 px-3 text-xs"
                onClick={() => navigate(`/app/messages?userId=${item.sender_id}`)}
              >
                Reply
              </Button>
            )}
            {item.type === 'nearby_user' && (
              <Button 
                size="sm" 
                variant="secondary" 
                className="h-8 px-3 text-xs"
                onClick={() => navigate(`/app/map?focus=${item.sender_id}`)}
              >
                <MapPin className="w-3 h-3 mr-1" />
                View
              </Button>
            )}
            {(item.type === 'location_share' || item.is_read) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => dismissNotification.mutate(item.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadNotifications.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => markAsRead(undefined)}
            className="text-primary"
          >
            Mark all as read
          </Button>
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
        <Tabs defaultValue="unread" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="unread" className="relative">
              Unread
              {unreadNotifications.length > 0 && (
                <Badge className="ml-2 h-5 px-1.5 text-[10px]">
                  {unreadNotifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value="unread" className="space-y-3">
            {unreadNotifications.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Check className="w-10 h-10 mx-auto text-green-500/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No new notifications</p>
                </CardContent>
              </Card>
            ) : (
              unreadNotifications.map(renderNotificationCard)
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {notifications.map(renderNotificationCard)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
