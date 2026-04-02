import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext'; // Added
import { toast } from 'sonner'; // Added

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
  const { user } = useAuth(); // Now we have the user
  const [result, setResult] = useState<LaunchZoneResult>({ 
    isInLaunchZone: null, 
    cityName: null, 
    currentCount: 0, 
    targetCount: 500, 
    isLoading: true 
  });

  // --- 1. GEOLOCATION CHECK ---
  useEffect(() => {
    if (!latitude || !longitude) {
      setResult(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const checkZone = async () => {
      try {
        const { data: milestones } = await supabase
          .from('city_milestones')
          .select('*');

        if (!milestones || milestones.length === 0) {
          setResult(prev => ({ ...prev, isInLaunchZone: true, isLoading: false }));
          return;
        }

        let nearest = milestones[0];
        let nearestDist = Infinity;
        let foundZone = false;

        for (const m of milestones) {
          const dist = distanceKm(latitude, longitude, m.center_lat, m.center_long);
          const radius = m.radius_km || 50;
          
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = m;
          }

          if (dist <= radius) {
            setResult({
              isInLaunchZone: m.is_unlocked ?? true,
              cityName: m.city_name,
              currentCount: m.current_count || 0,
              targetCount: m.target_count || 500,
              isLoading: false,
            });
            foundZone = true;
            break;
          }
        }

        if (!foundZone) {
          setResult({
            isInLaunchZone: false,
            cityName: nearest.city_name,
            currentCount: nearest.current_count || 0,
            targetCount: nearest.target_count || 500,
            isLoading: false,
          });
        }
      } catch (err) {
        setResult(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkZone();
  }, [latitude, longitude]);

  // --- 2. AUTOMATIC PIONEER ASSIGNMENT (The RPC) ---
  useEffect(() => {
    const autoAssign = async () => {
      // Only assign if we are in a locked zone and have a user
      if (user?.id && result.cityName && result.isInLaunchZone === false && !result.isLoading) {
        const { data: pioneerNum, error } = await supabase.rpc('increment_pioneer_count', {
          target_city: result.cityName,
          target_user: user.id
        });

        if (!error && pioneerNum) {
          toast.success(`You are Pioneer #${pioneerNum} in ${result.cityName}! 🚀`);
        }
      }
    };

    autoAssign();
  }, [user?.id, result.cityName, result.isLoading, result.isInLaunchZone]);

  // --- 3. REAL-TIME SUBSCRIPTION (Freshness) ---
  useEffect(() => {
    if (!result.cityName) return;

    const channel = supabase
      .channel('milestone-updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'city_milestones',
        filter: `city_name=eq.${result.cityName}` 
      }, (payload) => {
        setResult(prev => ({
          ...prev,
          currentCount: payload.new.current_count,
          isInLaunchZone: payload.new.is_unlocked
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [result.cityName]);

  return result;
}
