import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Global real-time notification hook that listens for 
 * friend requests, event invites, messages, and location shares
 * and invalidates relevant queries + shows toast notifications
 */
export function useRealtimeNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

    return () => {
      supabase.removeChannel(friendshipChannel);
      supabase.removeChannel(eventInviteChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(locationShareChannel);
    };
  }, [user, queryClient]);
}
