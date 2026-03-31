import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { Loader2 } from 'lucide-react';

interface LaunchGuardProps {
  children: (data: { 
    isLocked: boolean; 
    milestone: any; 
    cityName: string;
    loading: boolean;
  }) => React.ReactNode;
}

export const LaunchGuard = ({ children }: LaunchGuardProps) => {
    const { user } = useAuth();
    const { location } = useGeolocation();
  
    const { data: feedData, isLoading } = useQuery({
      queryKey: ['smart-feed', user?.id, location?.latitude, location?.longitude],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke('generate-smart-feed', {
          body: { 
            user_id: user?.id, 
            user_lat: location?.latitude, 
            user_long: location?.longitude 
          }
        });
        if (error) throw error;
        return data;
      },
      enabled: !!user && !!location,
      staleTime: 1000 * 60 * 5, // Cache for 5 mins to prevent re-blurring
    });
  
    const milestone = feedData?.milestone;
    // Standardize the lock check to the backend boolean
    const isLocked = milestone?.is_unlocked === false;
    const cityName = milestone?.zone_name || "Your area";
  
    if (isLoading) {
      return (
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
  
    // We return the render prop so the parent (Feed/Map) can decide 
    // where to put the blur and where to put the "Waiting Room"
    return <>{children({ 
      isLocked, 
      milestone, 
      cityName, 
      loading: isLoading,
      events: feedData?.events || [], // Add this
      communities: feedData?.communities || [] // Add this
    })}</>;
};