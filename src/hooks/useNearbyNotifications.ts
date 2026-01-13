import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/contexts/LocationContext';
import { toast } from 'sonner';

const NEARBY_RADIUS_KM = 25; // 25km threshold
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per user

interface NearbyUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  distance_km: number;
}

export function useNearbyNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { location } = useGeolocation();
  const notifiedUsersRef = useRef<Map<string, number>>(new Map()); // userId -> timestamp
  const lastCheckRef = useRef<number>(0);

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
    refetchInterval: 30000, // Refresh every 30 seconds
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
      metadata?: { distance_km?: number; avatar_url?: string | null; timestamp?: string };
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

  // Check for nearby friends and create notifications
  const checkNearbyUsers = useCallback(async () => {
    if (!userId || !location) return;

    const now = Date.now();
    
    // Rate limit checks
    if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    try {
      // Use the existing RPC function to get nearby users
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

      // Get friends list to only notify about friends
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      const friendIds = new Set(
        friendships?.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id) || []
      );

      // Filter to friends only and check cooldown
      const newNearbyFriends = (nearbyUsers as NearbyUser[]).filter(user => {
        if (!friendIds.has(user.user_id)) return false;
        
        const lastNotified = notifiedUsersRef.current.get(user.user_id);
        if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) {
          return false;
        }
        
        return true;
      });

      // Create notifications for new nearby friends
      for (const friend of newNearbyFriends) {
        const distanceText = friend.distance_km < 1 
          ? `${Math.round(friend.distance_km * 1000)}m` 
          : `${friend.distance_km.toFixed(1)}km`;

        // Store notification in database
        await createNotification.mutateAsync({
          type: 'nearby_user',
          title: 'Friend Nearby!',
          message: `${friend.display_name || 'A friend'} is ${distanceText} away from you`,
          senderId: friend.user_id,
          metadata: {
            distance_km: friend.distance_km,
            avatar_url: friend.avatar_url,
            timestamp: new Date().toISOString()
          }
        });

        // Update cooldown tracker
        notifiedUsersRef.current.set(friend.user_id, now);

        // Also show a toast for immediate feedback
        toast.info(`${friend.display_name || 'A friend'} is nearby!`, {
          description: `${distanceText} away from your location`,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error checking nearby users:', error);
    }
  }, [userId, location, createNotification]);

  // Set up periodic checks
  useEffect(() => {
    if (!userId || !location) return;

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkNearbyUsers, 5000);
    
    // Periodic checks
    const interval = setInterval(checkNearbyUsers, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userId, location, checkNearbyUsers]);

  // Real-time subscription for notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
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
          
          // Show toast for new notification
          const notification = payload.new as { title: string; message: string; type: string };
          if (notification.type === 'nearby_user') {
            // Already shown via the creation flow
          } else {
            toast.info(notification.title, {
              description: notification.message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return {
    unreadCount,
    markAsRead: markAsRead.mutate,
    createNotification: createNotification.mutate,
    checkNearbyUsers,
  };
}
