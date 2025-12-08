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
  
  // Initialize state from LocalStorage (Your original logic)
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
  
  // Refs for tracking state without re-renders
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

  // Helper: Update Database (Throttled)
  const updateDatabase = useCallback(async (loc: LocationData, isSharing: boolean = true) => {
    if (!user) return;

    // Throttle: Prevent too-frequent updates (30s)
    const now = Date.now();
    if (now - lastSentRef.current < 30000) return;
    lastSentRef.current = now;

    try {
      const { error } = await supabase
        .from('user_locations')
        .upsert({
          user_id: user.id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          is_sharing_location: isSharing,
          last_seen: new Date().toISOString(),
        });
      
      if (error) throw error;
      console.log('Location synced to cloud');
    } catch (err) {
      console.error('Location sync error:', err);
    }
  }, [user]);

  // Helper: Update Online Status only
  const updateOnlineStatus = useCallback(async (isOnline: boolean) => {
    if (!user) return;
    try {
      await supabase
        .from('user_locations')
        .update({
          is_sharing_location: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    } catch (err) {
      console.error('Failed to update status:', err);
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
    updateDatabase(loc, true);

    if (!hasShownErrorRef.current) {
      // Optional: Toast on first success? 
      // toast.success('Location active');
      hasShownErrorRef.current = true; // Mark as shown so we don't spam
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
      // If we have cached data, timeout isn't critical
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
    
    // If we have cached data, assume offline but keep data
    if (location) {
      updateOnlineStatus(false);
    }
  }, [location, updateOnlineStatus]);

  // Manual Request (Exposed to UI)
  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    setLoading(true);
    hasShownErrorRef.current = false; // Reset to allow new error toasts

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
          // Retry on timeout (code 3) once
          if (err.code === 3 && attempts < 2) {
            console.log('Retrying location...');
            attemptFix();
          } else {
            handleError(err);
            // Even if it fails, start watching (might get a fix later)
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

    // 3. Visibility Listeners (Online/Offline)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') updateOnlineStatus(false);
      else updateOnlineStatus(true);
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', () => updateOnlineStatus(false));

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, handleSuccess, handleError, updateOnlineStatus]);

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
