import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LaunchZoneResult {
  isInLaunchZone: boolean | null; // null = still loading
  isWithinCity: boolean;          // true = user is inside a registered city
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
  resolvedCityName?: string | null,
): LaunchZoneResult {
  const [result, setResult] = useState<LaunchZoneResult>({
    isInLaunchZone: null,
    isWithinCity: false,
    cityName: null,
    currentCount: 0,
    targetCount: 0,
    isLoading: true,
  });

  const latRef = useRef(latitude);
  const lonRef = useRef(longitude);
  const cityRef = useRef<string | null>(null);
  
  latRef.current = latitude;
  lonRef.current = longitude;

  const checkZone = useCallback(async (cancelled: { current: boolean }) => {
    const lat = latRef.current;
    const lon = lonRef.current;
    if (lat == null || lon == null) return;

    try {
      // 1. COORDINATE MATCHING: Round to 2 decimal places as requested
      const roundedLat = parseFloat(lat.toFixed(2));
      const roundedLon = parseFloat(lon.toFixed(2));

      // Fetch all milestones to check for coordinate or radius matches
      const { data: milestones, error } = await supabase
        .from('city_milestones')
        .select('*')
        .order('radius_km', { ascending: true });

      if (cancelled.current) return;

      if (error || !milestones) {
        setResult(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // 2. CHECK FOR WAITING ROOM / LAUNCH ZONE
      const match = milestones.find(m => {
        const mLatFixed = parseFloat(m.center_lat.toFixed(2));
        const mLonFixed = parseFloat(m.center_long.toFixed(2));
        // Check strict 2-decimal coordinate match first
        if (mLatFixed === roundedLat && mLonFixed === roundedLon) return true;
        
        // Fallback to radius check (Original logic)
        const dist = haversineKm(lat, lon, m.center_lat, m.center_long);
        return dist <= (m.radius_km ?? 25);
      });

      if (match) {
        cityRef.current = match.city_name;
        
        // 3. AUTOMATED COUNT: Count users in user_locations matching these 2-decimal coords
        const { count } = await supabase
          .from('user_locations') 
          .select('*', { count: 'exact', head: true })
          .eq('latitude', roundedLat)
          .eq('longitude', roundedLon);

        setResult({
          isInLaunchZone: match.is_unlocked === true,
          isWithinCity: true,
          cityName: match.city_name,
          currentCount: count || 0,
          targetCount: match.target_count || 500,
          isLoading: false,
        });
        return;
      }

      // 4. COMING SOON UI: Fallback for cities not in milestones (Original logic)
      cityRef.current = null;
      const geocodedCity = resolvedCityName?.toLowerCase().trim() ?? null;
      let waitlistCount = 0;

      if (geocodedCity) {
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .ilike('city', geocodedCity);
        if (!cancelled.current) waitlistCount = count ?? 0;
      }

      setResult({
        isInLaunchZone: false,
        isWithinCity: false,
        cityName: geocodedCity,
        currentCount: waitlistCount,
        targetCount: 0,
        isLoading: false,
      });

    } catch (err) {
      console.error('[LaunchZone] Error:', err);
      setResult(prev => ({ ...prev, isLoading: false }));
    }
  }, [resolvedCityName]);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const cancelled = { current: false };
    checkZone(cancelled);

    // 5. REAL-TIME: Listen for user changes to update Waiting Room counts
    const locationChannel = supabase
      .channel('location-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_locations' },
        () => checkZone(cancelled)
      )
      .subscribe();

    // 6. REAL-TIME: Listen for milestone changes (Original logic)
    const milestoneChannel = supabase
      .channel('milestone-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'city_milestones' },
        () => checkZone(cancelled)
      )
      .subscribe();

    // 7. REAL-TIME: Listen for waitlist additions (Coming Soon logic)
    const waitlistChannel = resolvedCityName 
      ? supabase
          .channel('waitlist-updates')
          .on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'waitlist', 
              filter: `city=eq.${resolvedCityName.toLowerCase().trim()}` 
            },
            () => {
              if (!cityRef.current) { // Only increment if in COMING_SOON state
                setResult(prev => ({ ...prev, currentCount: prev.currentCount + 1 }));
              }
            }
          )
          .subscribe()
      : null;

    return () => {
      cancelled.current = true;
      supabase.removeChannel(locationChannel);
      supabase.removeChannel(milestoneChannel);
      if (waitlistChannel) supabase.removeChannel(waitlistChannel);
    };
  }, [latitude, longitude, resolvedCityName, checkZone]);

  return result;
}
