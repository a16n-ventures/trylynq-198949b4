import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/contexts/LocationContext';
import { toast } from 'sonner';

const NEARBY_RADIUS_KM = 75; // 75km threshold
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per user

// Helper to calculate distance in KM
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface NearbyUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  distance_km: number;
}

export function useRealtimeNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { location } = useGeolocation();
  const notifiedUsersRef = useRef<Map<string, number>>(new Map()); // userId -> timestamp
  const lastCheckRef = useRef<number>(0);
  
  // Ref to track location for real-time calculations without re-renders
  const realtimeUserLocation = useRef<{ lat: number; lng: number } | null>(null);

  // Fetch unread notifications count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread_notifications', userId],
    queryFn: async () => {
      if (!userId) return 0;
      
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      
      if (error) {
        console.error('Error fetching unread count:', error);
        return 0;
      }
      
      return count || 0;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Create notification mutation
  const createNotification = useMutation({
    mutationFn: async ({ 
      type, 
      title, 
      message, 
      senderId,
      metadata 
    }: { 
      type: string;
      title: string;
      message: string;
      senderId?: string;
      metadata?: { distance_km?: number; avatar_url?: string | null; timestamp?: string; link?: string };
    }) => {
      if (!userId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type,
          title,
          message,
          sender_id: senderId,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : {},
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h expiry
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread_notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Mark notifications as read
  const markAsRead = useMutation({
    mutationFn: async (notificationIds?: string[]) => {
      if (!userId) throw new Error('Not authenticated');

      let query = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId);

      if (notificationIds && notificationIds.length > 0) {
        query = query.in('id', notificationIds);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread_notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Check for nearby friends (FALLBACK POLLING ONLY)
  const checkNearbyUsers = useCallback(async () => {
    if (!userId || !location) return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    try {
      const { data: nearbyUsers, error } = await supabase
        .rpc('get_nearby_users', { 
          p_user_id: userId, 
          p_radius_km: NEARBY_RADIUS_KM 
        });

      if (error) {
        console.error('Error fetching nearby users:', error);
        return;
      }

      if (!nearbyUsers || nearbyUsers.length === 0) return;

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      const friendIds = new Set(
        friendships?.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id) || []
      );

      const newNearbyFriends = (nearbyUsers as NearbyUser[]).filter(user => {
        if (!friendIds.has(user.user_id)) return false;
        const lastNotified = notifiedUsersRef.current.get(user.user_id);
        if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) return false;
        return true;
      });

      for (const friend of newNearbyFriends) {
        // NOTE: We do NOT insert into DB here anymore, because the SQL Trigger handles persistence.
        // We only show the local toast for immediate feedback if polling catches it.
        
        const distanceText = friend.distance_km < 1 
          ? `${Math.round(friend.distance_km * 1000)}m` 
          : `${friend.distance_km.toFixed(1)}km`;

        notifiedUsersRef.current.set(friend.user_id, now);

        toast.info(`${friend.display_name || 'A friend'} is nearby!`, {
          description: `${distanceText} away from your location`,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error checking nearby users:', error);
    }
  }, [userId, location]); // Removed createNotification from dependency

  // Set up periodic checks
  useEffect(() => {
    if (!userId || !location) return;
    const initialTimeout = setTimeout(checkNearbyUsers, 5000);
    const interval = setInterval(checkNearbyUsers, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userId, location, checkNearbyUsers]);

  // Unified Real-time Subscription
  useEffect(() => {
    if (!userId) return;

    if (navigator.geolocation) {
       const watchId = navigator.geolocation.watchPosition(
        (position) => {
          realtimeUserLocation.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        },
        (error) => console.error("Error watching location for notifications:", error),
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 27000 }
      );
    }

    const channel = supabase
      .channel(`notifications-${userId}`)
      // 1. Notification Table Listener (Handles Toasts for ALL persistent notifications)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['unread_notifications'] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          
          const notification = payload.new as { title: string; message: string; type: string };
          
          // Logic: If it's a 'nearby_user' notification, we generally rely on the Realtime Stream 
          // (below) for the immediate Toast because it's faster. 
          // However, if the App was backgrounded and the Trigger created it, this listener ensures we still see it.
          // To avoid double toasts (one from Stream, one from DB Insert), we can check logic or just allow it.
          // Since we removed DB Insert from the Stream below, THIS is now the only place responsible for 'Persistent' toasts?
          // No, Stream is faster. We'll skip Toast here if type is nearby_user to let Stream handle visuals.
          
          if (notification.type === 'nearby_user') {
             // Optional: Let the Stream handle the UI popup for better latency.
             // Or allow it here to be safe.
          } else {
            toast.info(notification.title, {
              description: notification.message,
            });
          }
        }
      )
      // 2. Friend Requests (NOW PERSISTENT)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friendships',
        filter: `addressee_id=eq.${userId}`
      }, async (payload: any) => {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', payload.new.requester_id).single();
        const name = profile?.display_name || 'Someone';
        
        // Save to DB
        await createNotification.mutateAsync({
          type: 'friend_request',
          title: 'New Friend Request',
          message: `${name} sent you a friend request!`,
          senderId: payload.new.requester_id,
          metadata: { link: '/app/notifications' }
        });
        
        queryClient.invalidateQueries({ queryKey: ['friends'] });
      })
      // 3. Friend Accepted (NOW PERSISTENT)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friendships',
        filter: `requester_id=eq.${userId}`
      }, async (payload: any) => {
        if (payload.new.status === 'accepted') {
          const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', payload.new.addressee_id).single();
          const name = profile?.display_name || 'Someone';
          
          // Save to DB
          await createNotification.mutateAsync({
            type: 'friend_accepted',
            title: 'Friend Request Accepted',
            message: `${name} accepted your friend request!`,
            senderId: payload.new.addressee_id
          });
          
          queryClient.invalidateQueries({ queryKey: ['friends'] });
        }
      })
      // 4. Event Invites (NOW PERSISTENT)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'event_invitations',
        filter: `invitee_id=eq.${userId}`
      }, async (payload: any) => {
        const [inviterRes, eventRes] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('user_id', payload.new.inviter_id).single(),
          supabase.from('events').select('title').eq('id', payload.new.event_id).single()
        ]);
        const name = inviterRes.data?.display_name || 'Someone';
        const eventTitle = eventRes.data?.title || 'an event';
        
        // Save to DB
        await createNotification.mutateAsync({
          type: 'event_invite',
          title: 'Event Invitation',
          message: `${name} invited you to "${eventTitle}"!`,
          senderId: payload.new.inviter_id,
          metadata: { link: '/app/notifications' }
        });
      })
      // 5. Messages (NOW PERSISTENT)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`
      }, async (payload: any) => {
        if (window.location.pathname !== '/app/messages') {
          const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', payload.new.sender_id).single();
          const name = profile?.display_name || 'Someone';
          const content = payload.new.content?.slice(0, 50) || '📷 Photo';
          
          // Save to DB
          await createNotification.mutateAsync({
            type: 'message',
            title: `New message from ${name}`,
            message: content,
            senderId: payload.new.sender_id,
            metadata: { link: '/app/messages' }
          });
        }
        queryClient.invalidateQueries({ queryKey: ['dm_list'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      })
      // 6. Location Shares (NOW PERSISTENT)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'location_shares',
        filter: `recipient_id=eq.${userId}`
      }, async (payload: any) => {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', payload.new.sharer_id).single();
        const name = profile?.display_name || 'Someone';
        
        // Save to DB
        await createNotification.mutateAsync({
          type: 'location_share',
          title: 'Location Shared',
          message: `${name} is sharing their location with you!`,
          senderId: payload.new.sharer_id,
          metadata: { link: '/app/map' }
        });
      })
      // 7. Nearby Users (PRIMARY VISUAL FEEDBACK)
      // Note: We do NOT insert to DB here. The SQL Trigger handles that.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_locations',
      }, async (payload: any) => {
        const newData = payload.new;
        if (newData.user_id === userId) return;
        if (!realtimeUserLocation.current) return;
        if (!newData.latitude || !newData.longitude) return;

        const distance = calculateDistance(
          realtimeUserLocation.current.lat,
          realtimeUserLocation.current.lng,
          newData.latitude,
          newData.longitude
        );

        if (distance <= NEARBY_RADIUS_KM) {
          const now = Date.now();
          const lastNotified = notifiedUsersRef.current.get(newData.user_id);
          if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) return;

          const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', newData.user_id).single();
          const name = profile?.display_name || 'Someone';
          const distanceText = distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`;

          // Mark as notified locally to prevent spamming toasts
          notifiedUsersRef.current.set(newData.user_id, now);
          
          // Show Toast Immediately (Visual Only)
          toast.success(`${name} is nearby!`, {
            description: `${distanceText} away from your location.`,
            action: {
              label: 'See Map',
              onClick: () => window.location.href = '/app/map'
            }
          });
          
          // We intentionally do NOT await createNotification here. 
          // The SQL Trigger 'on_location_change_notify' will handle the persistence in the background.
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Clean up geolocation watch is handled by React return
    };
  }, [userId, queryClient, createNotification]);

  return {
    unreadCount,
    markAsRead: markAsRead.mutate,
    createNotification: createNotification.mutate,
    checkNearbyUsers,
  };
}
