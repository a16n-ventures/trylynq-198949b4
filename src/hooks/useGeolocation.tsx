import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- Types ---
interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LocationContextType {
  location: Coordinates | null;
  error: string | null;
  isLoading: boolean;
  requestLocation: () => Promise<void>;
  updateDatabaseLocation: (coords: Coordinates) => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// --- Constants ---
const DB_UPDATE_THRESHOLD_MS = 60000; // Only update DB every 1 minute to save bandwidth
const HIGH_ACCURACY = true;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastDbUpdate, setLastDbUpdate] = useState<number>(0);

  // Helper: Update Supabase (Throttled)
  const updateDatabaseLocation = useCallback(async (coords: Coordinates) => {
    if (!user) return;

    const now = Date.now();
    // Prevent spamming the database (throttle)
    if (now - lastDbUpdate < DB_UPDATE_THRESHOLD_MS) return;

    try {
      const { error: dbError } = await supabase
        .from('user_locations')
        .upsert({
          user_id: user.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          is_sharing_location: true,
          updated_at: new Date().toISOString(),
        });

      if (dbError) throw dbError;
      setLastDbUpdate(now);
    } catch (err) {
      console.error("Failed to sync location to cloud:", err);
    }
  }, [user, lastDbUpdate]);

  // Main Action: Get Current Position
  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError(null);

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setLocation(coords);
          setIsLoading(false);
          
          // Automatically sync to DB when we get a fresh fix
          updateDatabaseLocation(coords); 
          resolve();
        },
        (err) => {
          console.error("Location error:", err);
          let msg = "Unable to retrieve your location";
          if (err.code === err.PERMISSION_DENIED) msg = "Location permission denied";
          if (err.code === err.POSITION_UNAVAILABLE) msg = "Location unavailable";
          if (err.code === err.TIMEOUT) msg = "Location request timed out";
          
          setError(msg);
          setIsLoading(false);
          resolve();
        },
        { 
          enableHighAccuracy: HIGH_ACCURACY, 
          timeout: 15000, 
          maximumAge: 10000 
        }
      );
    });
  }, [updateDatabaseLocation]);

  // Initial Fetch on Mount (Optional: remove if you want lazy loading)
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return (
    <LocationContext.Provider value={{ location, error, isLoading, requestLocation, updateDatabaseLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

// --- Hook ---
export function useGeolocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useGeolocation must be used within a LocationProvider');
  }
  return context;
}
