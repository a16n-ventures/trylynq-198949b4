import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- Types ---
interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface LocationContextType {
  location: LocationData | null;
  error: string | null;
  isLoading: boolean;
  requestLocation: () => Promise<void>; // Manual trigger
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const LOCAL_KEY = 'last_known_location';

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  // Initialize state from LocalStorage
  const [location, setLocation] = useState<LocationData | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const watchId = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const hasShownErrorRef = useRef(false);
  const initialLocationObtainedRef = useRef(false);

  // Helper: Save to local storage
  const saveLocal = (loc: LocationData) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(loc));
    } catch {
      // ignore storage quota errors
    }
  };

  // Helper: Update Database (Safe Patch Strategy)
  // FIX: This function now ONLY updates coordinates. It NEVER touches is_sharing_location.
  const updateDatabase = useCallback(async (loc: LocationData) => {
    if (!user) return;

    // Throttle: Prevent too-frequent updates (30s)
    const now = Date.now();
    if (now - lastSentRef.current < 30000) return;
    lastSentRef.current = now;

    try {
      const payload = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        last_seen: new Date().toISOString(),
      };

      // 1. Try to UPDATE existing row first (Preserves is_sharing_location)
      const { error: updateError, count } = await supabase
        .from('user_locations')
        .update(payload)
        .eq('user_id', user.id)
        .select('user_id', { count: 'exact' });

      if (updateError) throw updateError;

      // 2. If no row existed, INSERT new row (Default is_sharing_location will apply)
      if (count === 0) {
        const { error: insertError } = await supabase
          .from('user_locations')
          .insert({
            user_id: user.id,
            ...payload,
            is_sharing_location: false // Default to false for new rows
          });
        
        if (insertError) throw insertError;
      }

      console.log('Location synced to cloud');
    } catch (err) {
      console.error('Location sync error:', err);
    }
  }, [user]);

  // Core: Success Handler
  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    const loc: LocationData = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };

    initialLocationObtainedRef.current = true;
    setLocation(loc);
    setError(null);
    setLoading(false);
    saveLocal(loc);
    updateDatabase(loc);

    if (!hasShownErrorRef.current) {
      hasShownErrorRef.current = true; 
    }
  }, [updateDatabase]);

  // Core: Error Handler
  const handleError = useCallback((err: GeolocationPositionError) => {
    console.warn('Geolocation error:', err.code, err.message);
    let message = 'Unable to access your location.';
    let critical = true;

    if (err.code === 1) {
      message = 'Location permission denied. Please enable it in browser settings.';
    } else if (err.code === 2) {
      message = 'Location unavailable.';
      critical = false; 
    } else if (err.code === 3) {
      message = 'Location request timed out.';
      if (location) critical = false; 
    }

    if (critical) {
      setError(message);
      if (!hasShownErrorRef.current) {
        toast.error(message);
        hasShownErrorRef.current = true;
      }
    }
    setLoading(false);
  }, [location]);

  // Manual Request (Exposed to UI)
  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    setLoading(true);
    hasShownErrorRef.current = false; 

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [handleSuccess, handleError]);

  // Effect: Auto-Start on Mount
  useEffect(() => {
    if (!user) return;
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    // 1. Try High Accuracy Single Shot
    let attempts = 0;
    const attemptFix = () => {
      attempts++;
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (err) => {
          if (err.code === 3 && attempts < 2) {
            console.log('Retrying location...');
            attemptFix();
          } else {
            handleError(err);
            startWatching();
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    };

    // 2. Start Continuous Watch
    const startWatching = () => {
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(
        handleSuccess,
        (err) => console.warn("Watch warning:", err.message), 
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 30000 }
      );
    };

    attemptFix();

    // FIX: Removed the "beforeunload" listener that was resetting status to false on refresh.

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [user, handleSuccess, handleError]);

  return (
    <LocationContext.Provider value={{ location, error, isLoading: loading, requestLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

// --- Hook Export ---
export function useGeolocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useGeolocation must be used within a LocationProvider');
  }
  return context;
}
