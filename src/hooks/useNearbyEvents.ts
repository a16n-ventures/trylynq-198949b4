import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
};

type Origin = { latitude: number; longitude: number } | null;

interface Options {
  userLocation: Origin;
  cityCenter: Origin;            // city_milestone center if user is in a launch zone
  radiusKm: number;              // 5..25
  enabled?: boolean;
}

/**
 * Single source of truth for "events near me".
 * - origin = cityCenter (preferred) or userLocation
 * - reads coords + name from event_locations (single source of truth)
 * - subscribes to event_attendees so attendee_count stays live
 */
export function useNearbyEvents({ userLocation, cityCenter, radiusKm, enabled = true }: Options) {
  const qc = useQueryClient();
  const origin = cityCenter ?? userLocation;

  const queryKey = ['nearby-events', origin?.latitude, origin?.longitude, radiusKm];

  const query = useQuery({
    queryKey,
    enabled: enabled && !!origin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NearbyEvent[]> => {
      if (!origin) return [];
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, description, start_date, end_date, ticket_price, image_url, category, creator_id, max_attendees, ' +
          'creator:profiles!events_creator_id_fkey(verification_status), ' +
          'event_attendees(user_id, status, profiles(avatar_url)), ' +
          'event_locations(location_name, latitude, longitude)'
        )
        .gt('start_date', new Date().toISOString())
        .eq('is_public', true);

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
          if (dist > radiusKm) return null;

          const confirmed = (e.event_attendees || []).filter((a: any) => a.status === 'confirmed');
          const friend_images = confirmed
            .map((a: any) => a.profiles?.avatar_url)
            .filter(Boolean)
            .slice(0, 3);

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
          };
        })
        .filter((x): x is NearbyEvent => x !== null)
        .sort((a, b) => a.distanceKm - b.distanceKm);
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
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, origin?.latitude, origin?.longitude, radiusKm]);

  return query;
}
