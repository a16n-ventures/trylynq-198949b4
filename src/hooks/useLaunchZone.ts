import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LaunchZoneResult {
  isInLaunchZone: boolean | null; // null = still checking
  cityName: string | null;
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
  const [result, setResult] = useState<LaunchZoneResult>({ isInLaunchZone: null, cityName: null, isLoading: true });

  useEffect(() => {
    if (!latitude || !longitude) {
      setResult({ isInLaunchZone: null, cityName: null, isLoading: false });
      return;
    }

    const check = async () => {
      setResult(prev => ({ ...prev, isLoading: true }));
      try {
        const { data: milestones } = await supabase
          .from('city_milestones')
          .select('city_name, center_lat, center_long, radius_km, is_unlocked');

        if (!milestones || milestones.length === 0) {
          // No milestones configured = allow all
          setResult({ isInLaunchZone: true, cityName: null, isLoading: false });
          return;
        }

        for (const m of milestones) {
          const dist = distanceKm(latitude, longitude, m.center_lat, m.center_long);
          const radius = m.radius_km || 50;
          if (dist <= radius) {
            setResult({ 
              isInLaunchZone: m.is_unlocked ?? true, 
              cityName: m.city_name, 
              isLoading: false 
            });
            return;
          }
        }

        // Not within any configured city
        setResult({ isInLaunchZone: false, cityName: null, isLoading: false });
      } catch {
        setResult({ isInLaunchZone: null, cityName: null, isLoading: false });
      }
    };

    check();
  }, [latitude, longitude]);

  return result;
}
