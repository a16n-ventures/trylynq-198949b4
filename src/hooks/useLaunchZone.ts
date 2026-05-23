import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LaunchZoneResult {
  isInLaunchZone: boolean | null; 
  isWithinCity: boolean;          
  cityName: string | null;        // narrow: suburb / neighbourhood
  parentCity: string | null;      // broad: city / state for subtitle display
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
    parentCity: null,
    currentCount: 0,
    targetCount: 500,
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
      let detectedZone = 'Nearby';
      let detectedParentCity: string | null = null;

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`);
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          // Narrow: suburb/neighbourhood for the main city label
          detectedZone = addr.suburb || addr.neighbourhood || addr.quarter || addr.village || addr.town || addr.city || 'Nearby';
          // Broad: city → state → country for the subtitle "parent" label
          detectedParentCity = addr.city || addr.state_district || addr.state || addr.country || null;
          // Avoid showing same value twice (e.g. if detectedZone IS the city)
          if (detectedParentCity === detectedZone) {
            detectedParentCity = addr.state || addr.country || null;
          }
        }
      } catch (e) {
        console.error("Reverse geocoding error:", e);
      }

      if (cancelled.current) return;

      const roundedLat = parseFloat(lat.toFixed(2));
      const roundedLon = parseFloat(lon.toFixed(2));

      const { data: milestones, error } = await supabase
        .from('city_milestones')
        .select('*')
        .order('radius_km', { ascending: true });

      if (cancelled.current) return;

      if (error || !milestones) {
        setResult(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const match = milestones.find(m => {
        const mLatFixed = parseFloat(m.center_lat.toFixed(2));
        const mLonFixed = parseFloat(m.center_long.toFixed(2));
        if (mLatFixed === roundedLat && mLonFixed === roundedLon) return true;
        
        const dist = haversineKm(lat, lon, m.center_lat, m.center_long);
        return dist <= (m.radius_km ?? 25);
      });

      if (match) {
        cityRef.current = match.city_name;
        
        const { count } = await supabase
          .from('city_pioneers')
          .select('*', { count: 'exact', head: true })
          .eq('city_name', match.city_name);
          
        setResult({
          isInLaunchZone: match.is_unlocked === true,
          isWithinCity: true,
          cityName: detectedZone,
          parentCity: detectedParentCity,
          currentCount: count || 0, 
          targetCount: match.target_count || 500,
          isLoading: false,
        });
        return;
      }

      // Waiting list fallback block
      let waitlistCount = 0;
      if (detectedZone) {
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .ilike('city', detectedZone);
        if (!cancelled.current) waitlistCount = count ?? 0;
      }

      setResult({
        isInLaunchZone: false,
        isWithinCity: false,
        cityName: detectedZone,
        parentCity: detectedParentCity,
        currentCount: waitlistCount,
        targetCount: 500,
        isLoading: false,
      });

    } catch (err) {
      console.error('[LaunchZone] Error:', err);
      setResult(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const cancelled = { current: false };
    checkZone(cancelled);

    const pioneersChannel = supabase.channel('pioneers-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'city_pioneers' }, () => checkZone(cancelled))
      .subscribe();

    const milestoneChannel = supabase.channel('milestone-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'city_milestones' }, () => checkZone(cancelled))
      .subscribe();

    return () => {
      cancelled.current = true;
      supabase.removeChannel(pioneersChannel);
      supabase.removeChannel(milestoneChannel);
    };
  }, [latitude, longitude, checkZone]);

  return result;
}