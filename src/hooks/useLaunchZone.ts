import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LaunchZoneResult {
  isInLaunchZone: boolean | null;
  cityName: string | null;
  currentCount: number;
  targetCount: number;
  isLoading: boolean;
}

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export function useLaunchZone(latitude: number | null | undefined, longitude: number | null | undefined): LaunchZoneResult {
  const [result, setResult] = useState<LaunchZoneResult>({ isInLaunchZone: null, cityName: null, currentCount: 0, targetCount: 500, isLoading: true });

  // Inside useLaunchZone.ts
useEffect(() => {
  const autoAssignPioneer = async () => {
    // Only run if we have a user, a valid location, and they are in a zone
    if (user?.id && latitude && longitude && result.cityName && result.isInLaunchZone === false) {
      
      const { data, error } = await supabase.rpc('increment_pioneer_count', {
        target_city: result.cityName,
        target_user: user.id
      });

      if (error) {
        console.error("Pioneer assignment failed:", error);
      } else if (data) {
        // Asynchronously update the local state so the UI reflects the new count immediately
        setResult(prev => ({
          ...prev,
          currentCount: prev.currentCount + 1,
          // If this was the 500th person, you could even flip the unlock switch here
          isInLaunchZone: (prev.currentCount + 1) >= prev.targetCount ? true : false
        }));
        
        toast.success(`You are Pioneer #${data} in ${result.cityName}!`);
      }
    }
  };

  if (!result.isLoading) {
    autoAssignPioneer();
  }
}, [user?.id, result.cityName, result.isLoading]);
  
  useEffect(() => {
    if (!latitude || !longitude) {
      setResult({ isInLaunchZone: null, cityName: null, currentCount: 0, targetCount: 500, isLoading: false });
      return;
    }

    const check = async () => {
      setResult(prev => ({ ...prev, isLoading: true }));
      try {
        const { data: milestones } = await supabase
          .from('city_milestones')
          .select('city_name, center_lat, center_long, radius_km, is_unlocked, current_count, target_count');

        if (!milestones || milestones.length === 0) {
          setResult({ isInLaunchZone: true, cityName: null, currentCount: 0, targetCount: 500, isLoading: false });
          return;
        }

        for (const m of milestones) {
          const dist = distanceKm(latitude, longitude, m.center_lat, m.center_long);
          const radius = m.radius_km || 50;
          if (dist <= radius) {
            setResult({
              isInLaunchZone: m.is_unlocked ?? true,
              cityName: m.city_name,
              currentCount: m.current_count || 0,
              targetCount: m.target_count || 500,
              isLoading: false,
            });
            return;
          }
        }

        // Not within any configured city — find nearest
        let nearest = milestones[0];
        let nearestDist = Infinity;
        for (const m of milestones) {
          const dist = distanceKm(latitude, longitude, m.center_lat, m.center_long);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = m;
          }
        }

        setResult({
          isInLaunchZone: false,
          cityName: nearest.city_name,
          currentCount: nearest.current_count || 0,
          targetCount: nearest.target_count || 500,
          isLoading: false,
        });
      } catch {
        setResult({ isInLaunchZone: null, cityName: null, currentCount: 0, targetCount: 500, isLoading: false });
      }
    };

    check();
  }, [latitude, longitude]);

  return result;
}
