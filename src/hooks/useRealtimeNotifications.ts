import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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

/**
 * Global real-time notification hook that listens for 
 * friend requests, event invites, messages, location shares
 * AND nearby users, invalidating relevant queries + showing toast notifications
 */
export function useRealtimeNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Refs to track location and notification state without causing re-renders
  const userLocation = useRef<{ lat: number; lng: number } | null>(null);
  const notifiedNearbyUsers = useRef<Set<string>>(new Set());

  // 1. Track current user's location for distance calculations
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        userLocation.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
      },
      (error) => console.error("Error watching location for notifications:", error),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 27000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Subscribe to new friend requests
    const friendshipChannel = supabase
      .channel('global-friendships')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friendships',
        filter: `addressee_id=eq.${user.id}`
      }, async (payload: any) => {
        // Get sender info
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', payload.new.requester_id)
          .single();
        
        const name = profile?.display_name || 'Someone';
        toast.info(`${name} sent you a friend request!`, {
          action: {
            label: 'View',
            onClick: () => window.location.href = '/app/notifications'
          }
        });
        
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friendships',
        filter: `requester_id=eq.${user.id}`
      }, async (payload: any) => {
        if (payload.new.status === 'accepted') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', payload.new.addressee_id)
            .single();
          
          const name = profile?.display_name || 'Someone';
          toast.success(`${name} accepted your friend request!`);
          
          queryClient.invalidateQueries({ queryKey: ['friends'] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      })
      .subscribe();

    // Subscribe to event invitations
    const eventInviteChannel = supabase
      .channel('global-event-invites')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'event_invitations',
        filter: `invitee_id=eq.${user.id}`
      }, async (payload: any) => {
        // Get event and inviter info
        const [inviterRes, eventRes] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('user_id', payload.new.inviter_id).single(),
          supabase.from('events').select('title').eq('id', payload.new.event_id).single()
        ]);
        
        const name = inviterRes.data?.display_name || 'Someone';
        const eventTitle = eventRes.data?.title || 'an event';
        
        toast.info(`${name} invited you to "${eventTitle}"!`, {
          action: {
            label: 'View',
            onClick: () => window.location.href = '/app/notifications'
          }
        });
        
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();

    // Subscribe to new direct messages
    const messageChannel = supabase
      .channel('global-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, async (payload: any) => {
        // Only notify if we're not currently looking at this chat
        if (window.location.pathname !== '/app/messages') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', payload.new.sender_id)
            .single();
          
          const name = profile?.display_name || 'Someone';
          const content = payload.new.content?.slice(0, 50) || '📷 Photo';
          
          toast.info(`New message from ${name}`, {
            description: content,
            action: {
              label: 'View',
              onClick: () => window.location.href = '/app/messages'
            }
          });
        }
        
        queryClient.invalidateQueries({ queryKey: ['dm_list'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      })
      .subscribe();

    // Subscribe to location shares
    const locationShareChannel = supabase
      .channel('global-location-shares')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'location_shares',
        filter: `recipient_id=eq.${user.id}`
      }, async (payload: any) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', payload.new.sharer_id)
          .single();
        
        const name = profile?.display_name || 'Someone';
        
        toast.info(`${name} is sharing their location with you!`, {
          action: {
            label: 'View Map',
            onClick: () => window.location.href = '/app/map'
          }
        });
        
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();

    // ✅ NEW: Subscribe to nearby user updates (Friends or Discoverable Users)
    const nearbyUserChannel = supabase
      .channel('global-nearby-users')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_locations',
        // Note: filtering by distance must happen client-side due to realtime limitations
      }, async (payload: any) => {
        const newData = payload.new;
        
        // 1. Skip own updates
        if (newData.user_id === user.id) return;
        
        // 2. Ensure we have our own location to compare against
        if (!userLocation.current) return;
        
        // 3. Ensure updated location is valid
        if (!newData.latitude || !newData.longitude) return;

        // 4. Calculate distance
        const distance = calculateDistance(
          userLocation.current.lat,
          userLocation.current.lng,
          newData.latitude,
          newData.longitude
        );

        // 5. Check if within 25km radius
        if (distance <= 25) {
          // 6. Check if we already notified about this user in this session to prevent spam
          if (notifiedNearbyUsers.current.has(newData.user_id)) return;

          // 7. Fetch user details for the notification
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', newData.user_id)
            .single();
            
          const name = profile?.display_name || 'Someone';
          
          // 8. Send Notification
          toast.success(`${name} is nearby!`, {
            description: `${distance.toFixed(1)}km away from your location.`,
            action: {
              label: 'See Map',
              onClick: () => window.location.href = '/app/map'
            }
          });

          // 9. Mark as notified
          notifiedNearbyUsers.current.add(newData.user_id);
          
          // Optional: Invalidate nearby query to refresh lists
          queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(friendshipChannel);
      supabase.removeChannel(eventInviteChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(locationShareChannel);
      supabase.removeChannel(nearbyUserChannel);
    };
  }, [user, queryClient]);
}
