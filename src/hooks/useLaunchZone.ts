import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LaunchZoneResult {
  isInLaunchZone: boolean | null;
  isWithinCity: boolean;
  cityName: string | null;
  currentCount: number;
  targetCount: number;
  isLoading: boolean;
}

export function useLaunchZone(latitude: number | null | undefined, longitude: number | null | undefined): LaunchZoneResult {
  const [result, setResult] = useState<LaunchZoneResult>({
    isInLaunchZone: null,
    isWithinCity: false,
    cityName: null,
    currentCount: 0,
    targetCount: 0,
    isLoading: true,
  });

  useEffect(() => {
    if (!latitude || !longitude) {
      setResult(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const checkZone = async () => {
      const { data: milestones } = await supabase.from('city_milestones').select('*');
      if (!milestones || milestones.length === 0) {
        setResult(prev => ({ ...prev, isInLaunchZone: true, isLoading: false }));
        return;
      }

      let found = false;
      for (const m of milestones) {
        // Accurate Haversine Distance
        const R = 6371; 
        const dLat = (m.center_lat - latitude) * Math.PI / 180;
        const dLon = (m.center_long - longitude) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(latitude * Math.PI / 180) * Math.cos(m.center_lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const dist = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        if (dist <= (m.radius_km || 25)) {
          setResult({
            isInLaunchZone: m.is_unlocked ?? false,
            isWithinCity: true,
            cityName: m.city_name,
            currentCount: m.current_count || 0,
            targetCount: m.target_count || 0,
            isLoading: false,
          });
          found = true;
          break;
        }
      }

      if (!found) {
        setResult({ 
          isInLaunchZone: false, 
          isWithinCity: false, 
          cityName: null, 
          currentCount: 0, 
          targetCount: 0, 
          isLoading: false 
        });
      }
    };

    checkZone();
  }, [latitude, longitude]);

  return result;
}
