import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Profile } from "./useFriends";

export type NearbyProfile = Profile & {
  distance_km?: number;
};

const NEARBY_RADIUS_KM = 25;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useNearbyUsers(userId: string | undefined, enabled: boolean = true) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Get user's current location
  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationError(null);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access denied');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location unavailable');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timeout');
            break;
          default:
            setLocationError('Unknown location error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  const nearbyQuery = useQuery({
    queryKey: ['nearbyUsers', userId, userLocation?.lat, userLocation?.lng],
    queryFn: async (): Promise<NearbyProfile[]> => {
      if (!userId || !userLocation) return [];
      
      // Get existing friendships and blocked users to exclude
      const [{ data: friendships }, { data: blocked }] = await Promise.all([
        supabase.from('friendships').select('requester_id, addressee_id')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
        supabase.from('blocked_users').select('blocked_id')
          .eq('blocker_id', userId)
      ]);
      
      const excludeIds = new Set<string>([userId]);
      friendships?.forEach(f => {
        excludeIds.add(f.requester_id);
        excludeIds.add(f.addressee_id);
      });
      blocked?.forEach(b => excludeIds.add(b.blocked_id));

      // Try RPC function first
      const { data, error } = await supabase.rpc('get_nearby_users', {
        p_user_id: userId,
        p_radius_km: NEARBY_RADIUS_KM
      });

      if (error) {
        // Fallback: Get users with location manually
        const { data: fallbackUsers } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, latitude, longitude')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(50);
        
        if (!fallbackUsers) return [];

        return fallbackUsers
          .filter(u => !excludeIds.has(u.user_id) && u.latitude && u.longitude)
          .map(u => {
            const distance = calculateDistance(
              userLocation.lat, userLocation.lng,
              u.latitude!, u.longitude!
            );
            return {
              user_id: u.user_id,
              display_name: u.display_name,
              avatar_url: u.avatar_url,
              latitude: u.latitude,
              longitude: u.longitude,
              distance_km: distance
            };
          })
          .filter(u => u.distance_km <= NEARBY_RADIUS_KM)
          .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
      }

      // Filter out excluded users from RPC results
      const filteredData = (data || []).filter((u: any) => !excludeIds.has(u.user_id));
      
      // Always fetch real profile data for ALL nearby users to ensure we get actual names
      const allUserIds = filteredData.map((u: any) => u.user_id);
      
      if (allUserIds.length === 0) return [];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', allUserIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      // Merge RPC distance data with real profile data
      const nearbyWithRealProfiles = filteredData.map((u: any) => {
        const profile = profileMap.get(u.user_id);
        return {
          user_id: u.user_id,
          display_name: profile?.display_name || profile?.email?.split('@')[0] || u.display_name,
          avatar_url: profile?.avatar_url || u.avatar_url,
          distance_km: u.distance_km
        };
      });
      
      return nearbyWithRealProfiles;
    },
    enabled: enabled && !!userId && !!userLocation,
    staleTime: 60000,
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError(null);
      },
      () => toast.error('Location access denied')
    );
  };

  return {
    nearbyUsers: nearbyQuery.data || [],
    isLoading: nearbyQuery.isPending,
    error: nearbyQuery.error,
    userLocation,
    locationError,
    requestLocation,
  };
}
