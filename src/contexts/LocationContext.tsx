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
  requestLocation: () => Promise<void>;
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
  
  // ✅ NEW: Track if user has location sharing enabled
  const [isLocationSharingEnabled, setIsLocationSharingEnabled] = useState<boolean | null>(null);

  // Helper: Save to local storage
  const saveLocal = (loc: LocationData) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(loc));
    } catch {
      // ignore storage quota errors
    }
  };

  // ✅ FIXED: Load user's location sharing preference on mount
  useEffect(() => {
    if (!user) return;
    
    const loadLocationPreference = async () => {
      try {
        const { data, error } = await supabase
          .from('user_locations')
          .select('is_sharing_location')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Error loading location preference:', error);
          setIsLocationSharingEnabled(false);
          return;
        }
        
        // Set the user's saved preference
        const isSharing = data?.is_sharing_location ?? false;
        setIsLocationSharingEnabled(isSharing);
        console.log('📍 Location sharing preference loaded:', isSharing);
      } catch (err) {
        console.error('Failed to load location preference:', err);
        setIsLocationSharingEnabled(false);
      }
    };
    
    loadLocationPreference();
  }, [user]);

  // ✅ FIXED: Only update coordinates, NEVER touch is_sharing_location
  const updateDatabase = useCallback(async (loc: LocationData) => {
    if (!user || isLocationSharingEnabled === null) return;

    // Throttle: Prevent too-frequent updates (30s)
    const now = Date.now();
    if (now - lastSentRef.current < 30000) return;
    lastSentRef.current = now;

    try {
      const payload = {
        user_id: user.id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // ✅ CRITICAL FIX: Use upsert but DON'T override is_sharing_location
      // We only update coordinates, the toggle is managed separately in Profile.tsx
      const { error } = await supabase
        .from('user_locations')
        .upsert(payload, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      console.log('📍 Location coordinates synced (sharing status unchanged)');
    } catch (err) {
      console.error('Location sync error:', err);
    }
  }, [user, isLocationSharingEnabled]);

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
    
    // ✅ Only sync coordinates if sharing is enabled
    if (isLocationSharingEnabled) {
      updateDatabase(loc);
    }

    if (!hasShownErrorRef.current) {
      hasShownErrorRef.current = true; 
    }
  }, [updateDatabase, isLocationSharingEnabled]);

  // IP-based fallback when GPS unavailable / denied
  const tryIpFallback = useCallback(async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return false;
      const j = await res.json();
      if (typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        const loc: LocationData = {
          latitude: j.latitude,
          longitude: j.longitude,
          accuracy: 25000, // ~city-level
        };
        setLocation(loc);
        saveLocal(loc);
        setError(null);
        setLoading(false);
        console.log('📍 IP fallback location applied:', j.city, j.region);
        return true;
      }
    } catch (e) {
      console.warn('IP fallback failed:', e);
    }
    return false;
  }, []);

  // Core: Error Handler
  const handleError = useCallback((err: GeolocationPositionError) => {
    console.warn('Geolocation error:', err.code, err.message);
    let message = 'Unable to access your location.';
    let critical = true;

    if (err.code === 1) {
      message = 'Location permission denied. Using approximate location.';
      critical = false;
    } else if (err.code === 2) {
      message = 'Location unavailable.';
      critical = false; 
    } else if (err.code === 3) {
      message = 'Location request timed out.';
      if (location) critical = false; 
    }

    // Try IP fallback whenever GPS fails and we don't already have a fix
    if (!location) {
      tryIpFallback();
    }

    if (critical) {
      setError(message);
      if (!hasShownErrorRef.current) {
        toast.error(message);
        hasShownErrorRef.current = true;
      }
    }
    setLoading(false);
  }, [location, tryIpFallback]);

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

  // GPS tracking: ALWAYS obtain position for LaunchZone checks.
  // The sharing toggle only controls whether we sync to DB, not whether GPS runs.
  useEffect(() => {
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

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [handleSuccess, handleError]);

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
