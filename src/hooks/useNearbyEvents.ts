import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Shared distance helper (km)
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export type NearbyEvent = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  ticket_price: number | null;
  image_url: string | null;
  category: string | null;
  creator_id: string;
  max_attendees: number | null;
  location: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  attendee_count: number;
  friend_images: string[];
  is_verified: boolean;
  is_vibe: boolean;
  is_attending: boolean;
};

type Origin = { latitude: number; longitude: number } | null;

interface Options {
  userLocation: Origin;
  cityCenter: Origin;
  radiusKm: number;
  enabled?: boolean;
  isPremium?: boolean;     // premium users get a wider fallback radius
  pageSize?: number;
  userId?: string | null;  // for is_attending flag
}

const PREMIUM_FALLBACK_RADIUS_KM = 150;

export function useNearbyEvents({
  userLocation, cityCenter, radiusKm, enabled = true,
  isPremium = false, pageSize = 12, userId = null,
}: Options) {
  const qc = useQueryClient();
  const origin = cityCenter ?? userLocation;
  const originLabel: 'city' | 'gps' | 'none' = cityCenter ? 'city' : userLocation ? 'gps' : 'none';

  // Premium-but-outside-city users get an extended radius so they still see launch-zone events.
  const effectiveRadiusKm = useMemo(() => {
    if (isPremium && originLabel === 'gps') return Math.max(radiusKm, PREMIUM_FALLBACK_RADIUS_KM);
    return radiusKm;
  }, [isPremium, originLabel, radiusKm]);

  const queryKey = ['nearby-events', origin?.latitude, origin?.longitude, effectiveRadiusKm, userId];

  const query = useInfiniteQuery({
    queryKey,
    enabled: enabled && !!origin,
    refetchInterval: 60_000,
    initialPageParam: 0,
    getNextPageParam: (lastPage: NearbyEvent[], allPages) =>
      lastPage.length === pageSize ? allPages.length : undefined,
    queryFn: async ({ pageParam = 0 }): Promise<NearbyEvent[]> => {
      if (!origin) return [];
      const from = (pageParam as number) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, description, start_date, end_date, ticket_price, image_url, category, creator_id, max_attendees, ' +
          'creator:profiles!events_creator_id_fkey(verification_status), ' +
          'event_attendees(user_id, status, profiles(avatar_url)), ' +
          'event_locations(location_name, latitude, longitude)'
        )
        .gt('start_date', new Date().toISOString())
        .eq('is_public', true)
        .order('start_date', { ascending: true })
        .range(from, to);

      if (error) {
        console.error('[useNearbyEvents] query failed:', error);
        return [];
      }

      return (data || [])
        .map((e: any): NearbyEvent | null => {
          const loc = Array.isArray(e.event_locations) ? e.event_locations[0] : e.event_locations;
          if (!loc || loc.latitude == null || loc.longitude == null) return null;
          const lat = Number(loc.latitude);
          const lng = Number(loc.longitude);
          const dist = distanceKm(origin.latitude, origin.longitude, lat, lng);
          if (dist > effectiveRadiusKm) return null;

          const confirmed = (e.event_attendees || []).filter((a: any) => a.status === 'confirmed');
          const friend_images = confirmed
            .map((a: any) => a.profiles?.avatar_url)
            .filter(Boolean)
            .slice(0, 3);
          const is_attending = !!userId && (e.event_attendees || []).some((a: any) => a.user_id === userId);

          return {
            id: e.id,
            title: e.title,
            description: e.description,
            start_date: e.start_date,
            end_date: e.end_date,
            ticket_price: e.ticket_price,
            image_url: e.image_url,
            category: e.category,
            creator_id: e.creator_id,
            max_attendees: e.max_attendees,
            location: loc.location_name,
            latitude: lat,
            longitude: lng,
            distanceKm: Number(dist.toFixed(1)),
            attendee_count: confirmed.length,
            friend_images,
            is_verified: e.creator?.verification_status === 'verified',
            is_vibe: confirmed.length >= 10,
            is_attending,
          };
        })
        .filter((x): x is NearbyEvent => x !== null);
    },
  });

  // Realtime: refresh on attendee changes
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel('nearby-events-attendees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees' }, () => {
        qc.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, origin?.latitude, origin?.longitude, effectiveRadiusKm, userId]);

  const events = useMemo<NearbyEvent[]>(() => {
    const flat = (query.data?.pages.flat() ?? []) as NearbyEvent[];
    return flat.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [query.data]);

  return {
    ...query,
    events,
    originLabel,
    effectiveRadiusKm,
  };
}
