import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "./useFriends";

export type NearbyProfile = Profile & {
  distance_km?: number;
};

const NEARBY_RADIUS_KM = 25;

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns a rough lat/lng bounding box for a given centre + radius.
// Used to pre-filter DB rows before the exact haversine check so we never
// pull arbitrary row counts across the wire.
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────
//
// FIX 1 — Location is now a parameter, not managed internally.
// The caller passes coords from useGeolocation (LocationContext) so there is
// no second watchPosition subscription competing with the one already open in
// the context. Pass null when location is unavailable; the query will simply
// stay disabled until coords arrive.
//
// FIX 3 — requestLocation removed for the same reason. If the caller needs a
// retry button it should call requestLocation from useGeolocation directly.

export function useNearbyUsers(
  userId: string | undefined,
  userLocation: { lat: number; lng: number } | null, // from useGeolocation()
  enabled: boolean = true,
) {
  const nearbyQuery = useQuery({
    queryKey: ['nearbyUsers', userId, userLocation?.lat, userLocation?.lng],

    queryFn: async (): Promise<NearbyProfile[]> => {
      if (!userId || !userLocation) return [];

      // ── Step 1: Build exclusion set ────────────────────────────────────────
      // FIX 6 — Only exclude ACCEPTED friendships.
      // Pending requests are kept in the results so the user can still
      // discover and see people they've sent (or received) a request from.
      const [{ data: friendships }, { data: blocked }] = await Promise.all([
        supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .eq('status', 'accepted'),           // ← only confirmed friends excluded
        supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', userId),
      ]);

      const excludeIds = new Set<string>([userId]);
      friendships?.forEach(f => {
        excludeIds.add(f.requester_id);
        excludeIds.add(f.addressee_id);
      });
      blocked?.forEach(b => excludeIds.add(b.blocked_id));

      // ── Step 2a: Try RPC path ──────────────────────────────────────────────
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_nearby_users', {
        p_user_id: userId,
        p_radius_km: NEARBY_RADIUS_KM,
      });

      if (!rpcError && rpcData) {
        const filtered = (rpcData as any[]).filter(u => !excludeIds.has(u.user_id));
        if (filtered.length === 0) return [];

        // FIX 4 — Only fetch profiles for rows where the RPC didn't return a
        // display_name. Avoids a full second round-trip on every query when
        // the RPC is already joining profiles correctly.
        const missingProfile = filtered.filter(u => !u.display_name);
        let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();

        if (missingProfile.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', missingProfile.map(u => u.user_id));
          profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? []);
        }

        return filtered.map(u => {
          const fill = profileMap.get(u.user_id);
          return {
            user_id:      u.user_id,
            display_name: u.display_name ?? fill?.display_name ?? null,
            avatar_url:   u.avatar_url   ?? fill?.avatar_url   ?? null,
            distance_km:  u.distance_km,
          } as NearbyProfile;
        });
      }

      // ── Step 2b: Fallback path (RPC unavailable) ───────────────────────────
      // FIX 2 — Bounding-box pre-filter applied before fetching from
      // user_locations. Only rows inside the rough lat/lng rectangle are
      // pulled from the DB; the JS haversine then exact-filters that small
      // set. This replaces the old `.limit(100)` which had no spatial
      // awareness and could silently miss nearby users in dense areas.
      const bb = boundingBox(userLocation.lat, userLocation.lng, NEARBY_RADIUS_KM);

      const { data: nearbyLocs } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude')
        .eq('is_sharing_location', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude',  bb.minLat)
        .lte('latitude',  bb.maxLat)
        .gte('longitude', bb.minLng)
        .lte('longitude', bb.maxLng);

      if (!nearbyLocs || nearbyLocs.length === 0) return [];

      // Exact haversine filter + exclusion on the small bounding-box result set
      const candidates = nearbyLocs
        .filter(u => !excludeIds.has(u.user_id))
        .map(u => ({
          user_id:     u.user_id,
          distance_km: haversineKm(
            userLocation.lat, userLocation.lng,
            Number(u.latitude), Number(u.longitude),
          ),
        }))
        .filter(u => u.distance_km <= NEARBY_RADIUS_KM);

      if (candidates.length === 0) return [];

      // Single profile fetch for all candidates
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', candidates.map(u => u.user_id));

      const profMap = new Map(profiles?.map(p => [p.user_id, p]) ?? []);

      return candidates
        .map(u => {
          const prof = profMap.get(u.user_id);
          return {
            user_id:      u.user_id,
            display_name: prof?.display_name ?? null,
            avatar_url:   prof?.avatar_url   ?? null,
            distance_km:  u.distance_km,
          } as NearbyProfile;
        })
        .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    },

    enabled: enabled && !!userId && !!userLocation,

    // FIX 5 — staleTime set to Infinity.
    // The queryKey includes userLocation.lat/lng so any position change already
    // triggers a fresh fetch. A time-based stale window is redundant for moving
    // users and misleading for stationary ones — Infinity makes the refetch
    // strategy explicit: only location change or manual invalidation refetches.
    staleTime: Infinity,
  });

  return {
    nearbyUsers: nearbyQuery.data ?? [],
    isLoading:   nearbyQuery.isPending,
    error:       nearbyQuery.error,
  };
}
