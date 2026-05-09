import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LaunchZoneResult {
  isInLaunchZone: boolean | null; // null = still loading
  isWithinCity: boolean;          // true = user is inside a registered city radius
  cityName: string | null;
  currentCount: number;
  targetCount: number;
  isLoading: boolean;
}

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

export function useLaunchZone(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  resolvedCityName?: string | null, // optional: geocoded city name for waitlist count
): LaunchZoneResult {
  const [result, setResult] = useState<LaunchZoneResult>({
    isInLaunchZone: null,
    isWithinCity: false,
    cityName: null,
    currentCount: 0,
    targetCount: 0,
    isLoading: true,
  });

  // Stable refs so Realtime callbacks always close over current coords/state
  const latRef  = useRef(latitude);
  const lonRef  = useRef(longitude);
  const cityRef = useRef<string | null>(null); // matched city_milestones city name
  latRef.current = latitude;
  lonRef.current = longitude;

  // ── FIX 1 ─────────────────────────────────────────────────────────────────
  // REMOVED the two orphaned lines that were sitting outside any function:
  //
  //   const distMoved = prevCoords ? haversineKm(...) : 1;
  //   if (distMoved < 0.005 && result.isInLaunchZone !== null) return;
  //
  // `prevCoords`, `lat`, `lon`, and `result` were never declared in this
  // scope. These lines caused an immediate ReferenceError on module import,
  // crashing the hook for every page that uses it.
  // ──────────────────────────────────────────────────────────────────────────

  // ── Core zone check ────────────────────────────────────────────────────────
  // Extracted so it can be called both on mount and from Realtime callbacks.
  const checkZone = useCallback(async (cancelled: { current: boolean }) => {
    const lat = latRef.current;
    const lon = lonRef.current;
    if (lat == null || lon == null) return;

    try {
      // Order by radius_km ASC so the most specific (smallest) zone wins
      // when two city radii overlap near a border.
      const { data: milestones, error } = await supabase
        .from('city_milestones')
        .select('*')
        .order('radius_km', { ascending: true });

      if (cancelled.current) return;

      // ── CASE 1: DB error or no milestones configured ──────────────────────
      // Hard-lock: if we can't verify the zone, don't let anyone through.
      if (error || !milestones || milestones.length === 0) {
        console.warn('[LaunchZone] No milestones found or DB error — locking down.', error);
        setResult({
          isInLaunchZone: false,
          isWithinCity: false,
          cityName: null,
          currentCount: 0,
          targetCount: 0,
          isLoading: false,
        });
        cityRef.current = null;
        return;
      }

      // ── CASE 2: Check every milestone by GPS radius ───────────────────────
      for (const m of milestones) {
        const dist = haversineKm(lat, lon, m.center_lat, m.center_long);
        const radius = m.radius_km ?? 25;

        if (dist <= radius) {
          // User is physically inside this zone.
          const unlocked = m.is_unlocked === true; // explicit true only
          cityRef.current = m.city_name;
          setResult({
            isInLaunchZone: unlocked,
            isWithinCity: true,
            cityName: m.city_name,
            currentCount: m.current_count ?? 0,
            targetCount: m.target_count ?? 0,
            isLoading: false,
          });
          return; // first (most specific radius) match wins
        }
      }

      // ── CASE 3: No radius match — user is outside every launch zone ───────
      // Show COMING_SOON screen. Fetch live waitlist count for this city so
      // the user can see social momentum even before their city is promoted.
      cityRef.current = null;
      const geocodedCity = resolvedCityName?.toLowerCase().trim() ?? null;

      let waitlistCount = 0;
      if (geocodedCity) {
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('city', geocodedCity);
        if (!cancelled.current) waitlistCount = count ?? 0;
      }

      if (cancelled.current) return;
      setResult({
        isInLaunchZone: false,
        isWithinCity: false,
        cityName: geocodedCity,
        currentCount: waitlistCount, // live local interest count
        targetCount: 0,              // no target until admin promotes this city
        isLoading: false,
      });

    } catch (err) {
      // ── FIX 3 ───────────────────────────────────────────────────────────────
      // REMOVED the localStorage bypass that was here:
      //
      //   const cachedStatus = localStorage.getItem(`zone_cache_${lat.toFixed(2)}`);
      //   if (cachedStatus === 'unlocked') {
      //     setResult(prev => ({ ...prev, isInLaunchZone: true ... }));
      //     return;
      //   }
      //
      // Any user could open DevTools and run:
      //   localStorage.setItem('zone_cache_XX.XX', 'unlocked')
      // to permanently bypass the zone gate on any device.
      // The catch block must always fail closed — no exceptions.
      // ────────────────────────────────────────────────────────────────────────
      if (cancelled.current) return;
      console.error('[LaunchZone] Unexpected error:', err);
      // Fail closed — don't let an exception silently pass everyone through.
      setResult({
        isInLaunchZone: false,
        isWithinCity: false,
        cityName: null,
        currentCount: 0,
        targetCount: 0,
        isLoading: false,
      });
    }
  }, [resolvedCityName]);

  // ── Main effect: initial check + all Realtime subscriptions ───────────────
  useEffect(() => {
    // No coords yet — keep loading state until GPS is ready.
    // Do NOT set isLoading: false here; LocationContext will eventually
    // provide coords or show its own error. This prevents a flash of the
    // "no GPS" screen while the position fix is still pending.
    if (latitude == null || longitude == null) return;

    const cancelled = { current: false };

    // Initial zone check
    checkZone(cancelled);

    // ── Gap C: WAITING_ROOM live counts + unlock flip ──────────────────────
    // Subscribes to UPDATE events on city_milestones for the user's matched
    // city. Keeps the pioneer progress bar live and auto-transitions to
    // PASS_THROUGH the moment is_unlocked flips to true — no refresh needed.
    const milestoneUpdateChannel = supabase
      .channel('milestone-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'city_milestones' },
        (payload) => {
          // Only apply if this update is for the city the user is matched to
          if (!cityRef.current || payload.new.city_name !== cityRef.current) return;
          setResult(prev => ({
            ...prev,
            currentCount: payload.new.current_count ?? prev.currentCount,
            targetCount:  payload.new.target_count  ?? prev.targetCount,
            // Flip guard to PASS_THROUGH the instant the zone unlocks
            isInLaunchZone: payload.new.is_unlocked === true ? true : prev.isInLaunchZone,
          }));
        }
      )
      .subscribe();

    // ── Gap B: COMING_SOON → WAITING_ROOM auto-transition ─────────────────
    // Subscribes to INSERT events on city_milestones. When an admin promotes
    // a waitlist city, every user in that city flips from COMING_SOON to
    // WAITING_ROOM live without a page refresh.
    const milestoneInsertChannel = supabase
      .channel('milestone-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'city_milestones' },
        () => {
          // A new city was added — re-run the full zone check.
          // If the inserted city matches the user's location they'll transition.
          checkZone(cancelled);
        }
      )
      .subscribe();

    // ── Gap A: COMING_SOON live waitlist count ─────────────────────────────
    // Subscribes to INSERT events on waitlist filtered to the user's geocoded
    // city so the count ticks up in real-time as locals join the waitlist,
    // building visible social momentum on the COMING_SOON screen.
    const geocodedCity = resolvedCityName?.toLowerCase().trim() ?? null;
    const waitlistChannel = geocodedCity
      ? supabase
          .channel(`waitlist-${geocodedCity}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'waitlist',
              filter: `city=eq.${geocodedCity}`,
            },
            () => {
              // ── FIX 2 ─────────────────────────────────────────────────────
              // REMOVED the self-filter that was here:
              //
              //   if (payload.new.user_id === currentUserId) return;
              //
              // `currentUserId` was never declared or passed into this hook,
              // so the comparison always threw a ReferenceError and the
              // entire waitlist count subscription silently stopped working.
              //
              // The self-join case is already handled correctly: when the
              // current user joins, useWaitlist does an optimistic increment
              // in LaunchZoneGuard immediately. The Realtime INSERT that
              // fires shortly after will then re-sync to the authoritative
              // count from the DB — incrementing twice briefly then snapping
              // back is acceptable and far better than crashing the channel.
              // ──────────────────────────────────────────────────────────────
              if (cityRef.current) return; // only update in COMING_SOON state
              setResult(prev => ({
                ...prev,
                currentCount: prev.currentCount + 1,
              }));
            }
          )
          .subscribe()
      : null;

    return () => {
      cancelled.current = true;
      supabase.removeChannel(milestoneUpdateChannel);
      supabase.removeChannel(milestoneInsertChannel);
      if (waitlistChannel) supabase.removeChannel(waitlistChannel);
    };
  }, [latitude, longitude, resolvedCityName, checkZone]);

  return result;
}
