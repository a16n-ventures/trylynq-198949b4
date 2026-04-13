import { useState, useEffect } from 'react';
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
  longitude: number | null | undefined
): LaunchZoneResult {
  const [result, setResult] = useState<LaunchZoneResult>({
    isInLaunchZone: null,
    isWithinCity: false,
    cityName: null,
    currentCount: 0,
    targetCount: 0,
    isLoading: true,
  });

  useEffect(() => {
    // No coords yet — keep loading state until GPS is ready.
    // Do NOT set isLoading: false here; LocationContext will eventually
    // provide coords or show its own error. This prevents a flash of the
    // "no GPS" screen while the position fix is still pending.
    if (latitude == null || longitude == null) return;

    let cancelled = false;

    const checkZone = async () => {
      try {
        const { data: milestones, error } = await supabase
          .from('city_milestones')
          .select('*');

        if (cancelled) return;

        // ── CASE 1: DB error or no milestones configured ──────────────────
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
          return;
        }

        // ── CASE 2: Check every milestone by GPS radius ───────────────────
        for (const m of milestones) {
          const dist = haversineKm(latitude, longitude, m.center_lat, m.center_long);
          const radius = m.radius_km ?? 25;

          if (dist <= radius) {
            // User is physically inside this zone.
            const unlocked = m.is_unlocked === true ?? false; // explicit true only
            setResult({
              isInLaunchZone: unlocked,
              isWithinCity: true,
              cityName: m.city_name,
              currentCount: m.current_count ?? 0,
              targetCount: m.target_count ?? 0,
              isLoading: false,
            });
            return; // first match wins
          }
        }

        // ── CASE 3: No radius match — user is outside every launch zone ───
        // Show "Coming Soon / Ahmia hasn't landed in your city yet" screen.
        setResult({
          isInLaunchZone: false,
          isWithinCity: false,
          cityName: null,
          currentCount: 0,
          targetCount: 0,
          isLoading: false,
        });
      } catch (err) {
        if (cancelled) return;
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
    };

    checkZone();
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  return result;
}
