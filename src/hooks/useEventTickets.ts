import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TicketTier = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  capacity: number | null;
  sold_count: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export function useEventTicketTiers(eventId?: string) {
  return useQuery({
    queryKey: ['event-ticket-tiers', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<TicketTier[]> => {
      const { data, error } = await (supabase as any)
        .from('event_ticket_tiers')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        console.error('[useEventTicketTiers]', error);
        return [];
      }
      return (data || []) as TicketTier[];
    },
  });
}

export const tierAvailability = (t: TicketTier) => {
  if (t.capacity == null) return { remaining: Infinity, soldOut: false };
  const remaining = Math.max(0, t.capacity - (t.sold_count || 0));
  return { remaining, soldOut: remaining <= 0 };
};
