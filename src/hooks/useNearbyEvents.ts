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
  attendee_count: number;       // others going (excludes me)
  friend_images: string[];      // friends-only avatars (excludes me)
  friends_going_count: number;  // count of my friends going (excludes me)
  is_verified: boolean;
  is_vibe: boolean;
  is_attending: boolean; 
  is_official: boolean; 
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
  friendIds?: string[];    // to compute friends-going avatars/count
}

const PREMIUM_GPS_FALLBACK_RADIUS_KM = 75;
const PREMIUM_CITY_MAX_RADIUS_KM = 25;

export function useNearbyEvents({
  userLocation, cityCenter, radiusKm, enabled = true,
  isPremium = false, pageSize = 12, userId = null, friendIds = [],
}: Options) {
  const qc = useQueryClient();
  const origin = cityCenter ?? userLocation;
  const originLabel: 'city' | 'gps' | 'none' = cityCenter ? 'city' : userLocation ? 'gps' : 'none';

  // Premium gets a wider radius: in-city up to 25km, outside-city up to 75km.
  const effectiveRadiusKm = useMemo(() => {
    if (isPremium && originLabel === 'gps') return Math.max(radiusKm, PREMIUM_GPS_FALLBACK_RADIUS_KM);
    if (isPremium && originLabel === 'city') return Math.max(radiusKm, PREMIUM_CITY_MAX_RADIUS_KM);
    return radiusKm;
  }, [isPremium, originLabel, radiusKm]);

  const friendSet = useMemo(() => new Set((friendIds || []).filter(Boolean)), [friendIds]);
  const queryKey = ['nearby-events', origin?.latitude, origin?.longitude, effectiveRadiusKm, userId, friendSet.size];

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
          
      const latDelta = effectiveRadiusKm / 111;
      const lngDelta = effectiveRadiusKm / (111 * Math.cos((origin.latitude * Math.PI) / 180));

      // 1. Events + location (no fragile creator/attendee embed — those FKs don't exist in PostgREST cache)// Replace the single query with two parallel queries:
      
      // Query A — regular events with location (existing logic, keep !inner)
      const { data: locatedData, error: locatedError } = await supabase
        .from('events')
        .select(
          'id, title, description, start_date, end_date, ticket_price, image_url, category, creator_id, max_attendees, is_official, ' +
          'event_locations!inner(location_name, latitude, longitude)'
        )
        .gt('start_date', new Date().toISOString())
        .eq('is_public', true)
        .eq('is_official', false)             
         // non-official only
        .gte('event_locations.latitude',  origin.latitude  - latDelta)
        .lte('event_locations.latitude',  origin.latitude  + latDelta)
        .gte('event_locations.longitude', origin.longitude - lngDelta)
        .lte('event_locations.longitude', origin.longitude + lngDelta)
        .order('start_date', { ascending: true })
        .range(from, to);
      
      // Query B — official events, no location filter, LEFT join
      const { data: officialData, error: officialError } = await supabase
        .from('events')
        .select(
          'id, title, description, start_date, end_date, ticket_price, image_url, category, creator_id, max_attendees, is_official, ' +
          'event_locations(location_name, latitude, longitude)'  // left join — no !inner
        )
        .gt('start_date', new Date().toISOString())
        .eq('is_public', true)
        .eq('is_official', true)                               // official only
        .order('start_date', { ascending: true });
      
      if (locatedError) console.error('[useNearbyEvents] located query failed:', locatedError);
      if (officialError) console.error('[useNearbyEvents] official query failed:', officialError);
      
      const data = [...(locatedData || []), ...(officialData || [])];

      if (error) {
        console.error('[useNearbyEvents] query failed:', error);
        return [];
      }

      const eventIds = (data || []).map((e: any) => e.id);
      const creatorIds = Array.from(new Set((data || []).map((e: any) => e.creator_id).filter(Boolean)));

      // 2. Attendees + 3. creator verification, in parallel
      const [{ data: attendees }, { data: creators }] = await Promise.all([
        eventIds.length
          ? supabase.from('event_attendees').select('event_id, user_id, status').in('event_id', eventIds)
          : Promise.resolve({ data: [] as any[] }),
        creatorIds.length
          ? supabase.from('profiles').select('user_id, verification_status, avatar_url').in('user_id', creatorIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // 4. Avatar lookup for confirmed attendees
      const confirmedUserIds = Array.from(new Set(
        (attendees || []).filter((a: any) => a.status === 'confirmed').map((a: any) => a.user_id)
      ));
      const { data: attendeeProfiles } = confirmedUserIds.length
        ? await supabase.from('profiles').select('user_id, avatar_url').in('user_id', confirmedUserIds)
        : { data: [] as any[] };

      const avatarByUser = new Map((attendeeProfiles || []).map((p: any) => [p.user_id, p.avatar_url]));
      const creatorByUser = new Map((creators || []).map((p: any) => [p.user_id, p]));
      const attByEvent = new Map<string, any[]>();
      (attendees || []).forEach((a: any) => {
        if (!attByEvent.has(a.event_id)) attByEvent.set(a.event_id, []);
        attByEvent.get(a.event_id)!.push(a);
      });

      return (data || [])
          .map((e: any): NearbyEvent | null => {
          const loc = Array.isArray(e.event_locations) ? e.event_locations[0] : e.event_locations;
        
          // Official events: fall back to city center if no coordinates
          const isOfficial = !!e.is_official;
          const fallbackLat = origin.latitude;
          const fallbackLng = origin.longitude;
        
          const lat = Number(loc?.latitude ?? (isOfficial ? fallbackLat : null));
          const lng = Number(loc?.longitude ?? (isOfficial ? fallbackLng : null));
        
          if (!isOfficial && (loc?.latitude == null || loc?.longitude == null)) return null;
          if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
        
          const dist = distanceKm(origin.latitude, origin.longitude, lat, lng);
          // Official events bypass distance filter entirely
          if (!isOfficial && dist > effectiveRadiusKm) return null;

          const eAttendees = attByEvent.get(e.id) || [];
          const confirmed = eAttendees.filter((a: any) => a.status === 'confirmed');
          // Exclude current user from "others going"
          const others = confirmed.filter((a: any) => a.user_id !== userId);
          const friendsGoing = others.filter((a: any) => friendSet.has(a.user_id));
          const friend_images = friendsGoing
            .map((a: any) => avatarByUser.get(a.user_id))
            .filter(Boolean)
            .slice(0, 3) as string[];
          const is_attending = !!userId && eAttendees.some((a: any) => a.user_id === userId);

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
            attendee_count: others.length,
            friend_images,
            friends_going_count: friendsGoing.length,
            is_verified: creatorByUser.get(e.creator_id)?.verification_status === 'verified',
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
