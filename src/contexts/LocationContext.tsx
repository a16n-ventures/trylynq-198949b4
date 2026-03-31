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
  // In LocationContext.tsx, update the useState initialization
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      // If we have a cached location, no need to show loading
      return !localStorage.getItem(LOCAL_KEY);
    } catch {
      return true;
    }
  });
  
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
  // ✅ PRIVACY GUARD: Only sync to DB if the user explicitly allowed sharing
  if (!user || !isLocationSharingEnabled) return;

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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [handleSuccess, handleError]);

  // ✅ FIX: Change the effect to always attempt to get location for UI purposes
  useEffect(() => {
    if (!user) return; // Removed isLocationSharingEnabled check here
    
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }
  
    const startTracking = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleSuccess(pos);
          startWatching();
        },
        (err) => {
          handleError(err);
          startWatching();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };
  
    const startWatching = () => {
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(
        handleSuccess,
        (err) => console.warn("Watch warning:", err.message), 
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    };
  
    startTracking();
  
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [user, handleSuccess, handleError]); // Remove isLocationSharingEnabled from dependency

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
