// ====================================================
// Map Utilities & Geocoding Service
// ====================================================

import { supabase } from '@/integrations/supabase/client';

// --- Distance Calculation ---
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in kilometers
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
};

// --- Format Distance ---
export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${Math.round(km * 1000)}m away`;
  }
  return `${km.toFixed(1)}km away`;
};

// --- Geocoding Service ---

// Common locations database (Nigeria focus)
const LOCATION_DATABASE: Record<string, { lat: number; lng: number }> = {
  // Lagos Areas
  'lagos': { lat: 6.5244, lng: 3.3792 },
  'victoria island': { lat: 6.4281, lng: 3.4219 },
  'vi': { lat: 6.4281, lng: 3.4219 },
  'lekki': { lat: 6.4474, lng: 3.4726 },
  'lekki phase 1': { lat: 6.4474, lng: 3.4726 },
  'lekki phase 2': { lat: 6.4368, lng: 3.5158 },
  'ikeja': { lat: 6.5964, lng: 3.3425 },
  'yaba': { lat: 6.5074, lng: 3.3722 },
  'surulere': { lat: 6.4969, lng: 3.3581 },
  'ikoyi': { lat: 6.4541, lng: 3.4316 },
  'apapa': { lat: 6.4489, lng: 3.3594 },
  'festac': { lat: 6.4641, lng: 3.2839 },
  'ajah': { lat: 6.4667, lng: 3.5667 },
  'banana island': { lat: 6.4331, lng: 3.4247 },
  'maryland': { lat: 6.5729, lng: 3.3667 },
  'gbagada': { lat: 6.5373, lng: 3.3778 },
  'magodo': { lat: 6.5963, lng: 3.3660 },
  'ojota': { lat: 6.5684, lng: 3.3748 },
  'lagos island': { lat: 6.4541, lng: 3.3947 },
  'mushin': { lat: 6.5279, lng: 3.3394 },
  'oshodi': { lat: 6.5489, lng: 3.3264 },
  'isolo': { lat: 6.5253, lng: 3.2708 },
  'alimosho': { lat: 6.5964, lng: 3.1903 },
  
  // Abuja Areas
  'abuja': { lat: 9.0765, lng: 7.3986 },
  'wuse': { lat: 9.0579, lng: 7.4951 },
  'garki': { lat: 9.0354, lng: 7.4948 },
  'maitama': { lat: 9.0871, lng: 7.4951 },
  'asokoro': { lat: 9.0351, lng: 7.5284 },
  'gwarinpa': { lat: 9.1108, lng: 7.4105 },
  'kubwa': { lat: 9.1308, lng: 7.3339 },
  'nyanya': { lat: 8.9953, lng: 7.5605 },
  'lugbe': { lat: 8.9394, lng: 7.3693 },
  'jabi': { lat: 9.0699, lng: 7.4483 },
  
  // Port Harcourt
  'port harcourt': { lat: 4.8156, lng: 7.0498 },
  'rivers state': { lat: 4.8156, lng: 7.0498 },
  
  // Other Major Cities
  'ibadan': { lat: 7.3775, lng: 3.9470 },
  'kano': { lat: 12.0022, lng: 8.5920 },
  'benin': { lat: 6.3350, lng: 5.6037 },
  'kaduna': { lat: 10.5225, lng: 7.4383 },
  'jos': { lat: 9.9285, lng: 8.8921 },
  'enugu': { lat: 6.5244, lng: 7.5106 },
  'calabar': { lat: 4.9517, lng: 8.3417 },
  'warri': { lat: 5.5160, lng: 5.7500 },
  'owerri': { lat: 5.4840, lng: 7.0351 },
  'abeokuta': { lat: 7.1475, lng: 3.3619 },
  
  // Universities
  'unilag': { lat: 6.5158, lng: 3.3894 },
  'university of lagos': { lat: 6.5158, lng: 3.3894 },
  'lasu': { lat: 6.5386, lng: 3.2566 },
  'covenant university': { lat: 6.6733, lng: 3.1694 },
  'unn': { lat: 6.9089, lng: 7.4148 },
  'ui': { lat: 7.4467, lng: 3.9028 },
  'university of ibadan': { lat: 7.4467, lng: 3.9028 },
  
  // Popular Landmarks
  'lekki toll gate': { lat: 6.4426, lng: 3.4653 },
  'national stadium': { lat: 6.4996, lng: 3.3656 },
  'ikeja city mall': { lat: 6.6124, lng: 3.3506 },
  'eko hotel': { lat: 6.4275, lng: 3.4221 },
  'murtala mohammed airport': { lat: 6.5774, lng: 3.3210 },
  'nnamdi azikiwe airport': { lat: 9.0068, lng: 7.2631 },
  'shoprite': { lat: 6.4281, lng: 3.4219 },
  'palms mall': { lat: 6.4474, lng: 3.4726 },
};

/**
 * Geocode a location string to coordinates
 * @param location - Location string (e.g., "Lekki Phase 1, Lagos")
 * @returns Coordinates or null if not found
 */
export const geocodeLocation = async (
  location: string
): Promise<{ lat: number; lng: number } | null> => {
  if (!location) return null;

  const normalized = location.toLowerCase().trim();
  
  // Try exact match first
  if (LOCATION_DATABASE[normalized]) {
    return LOCATION_DATABASE[normalized];
  }

  // Try partial match
  for (const [key, coords] of Object.entries(LOCATION_DATABASE)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }

  // Try extracting major city names
  const cities = ['lagos', 'abuja', 'ibadan', 'kano', 'port harcourt'];
  for (const city of cities) {
    if (normalized.includes(city)) {
      return LOCATION_DATABASE[city];
    }
  }

  return null;
};

/**
 * Reverse geocode coordinates to location name
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Location name or null
 */
export const reverseGeocode = (
  lat: number,
  lng: number
): string | null => {
  let closestLocation: string | null = null;
  let minDistance = Infinity;

  for (const [name, coords] of Object.entries(LOCATION_DATABASE)) {
    const distance = calculateDistance(lat, lng, coords.lat, coords.lng);
    if (distance < minDistance) {
      minDistance = distance;
      closestLocation = name;
    }
  }

  // Only return if within 5km
  if (minDistance < 5) {
    return closestLocation;
  }

  return null;
};

// --- Location Permissions ---
export const checkLocationPermission = async (): Promise<boolean> => {
  if (!navigator.permissions) return false;

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return result.state === 'granted';
  } catch {
    return false;
  }
};

export const requestLocationPermission = async (): Promise<GeolocationPosition | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        console.error('Location permission denied:', error);
        resolve(null);
      }
    );
  });
};

// --- Database Operations ---

/**
 * Update user's location in database
 */
export const updateUserLocation = async (
  userId: string,
  latitude: number,
  longitude: number,
  isSharing: boolean = true
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_locations')
      .upsert({
        user_id: userId,
        latitude,
        longitude,
        is_sharing_location: isSharing,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to update location:', error);
    return false;
  }
};

/**
 * Get friends within radius
 */
export const getFriendsWithinRadius = async (
  userId: string,
  latitude: number,
  longitude: number,
  radiusKm: number = 10
): Promise<any[]> => {
  try {
    // Get friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) return [];

    const friendIds = friendships.map((f: any) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );

    // Get friend locations
    const { data: locations } = await supabase
      .from('user_locations')
      .select('user_id, latitude, longitude, updated_at')
      .in('user_id', friendIds)
      .eq('is_sharing_location', true);

    if (!locations) return [];

    // Filter by distance
    const nearby = locations.filter((loc) => {
      if (!loc.latitude || !loc.longitude) return false;
      const distance = calculateDistance(
        latitude,
        longitude,
        parseFloat(String(loc.latitude)),
        parseFloat(String(loc.longitude))
      );
      return distance <= radiusKm;
    });

    return nearby;
  } catch (error) {
    console.error('Failed to get nearby friends:', error);
    return [];
  }
};

/**
 * Store event location coordinates
 */
export const storeEventLocation = async (
  eventId: string,
  location: string
): Promise<boolean> => {
  try {
    const coords = await geocodeLocation(location);
    if (!coords) return false;

    // Create event_locations table if it doesn't exist
    // Then store coordinates
    const { error } = await supabase
      .from('event_locations')
      .upsert({
        event_id: eventId,
        latitude: coords.lat,
        longitude: coords.lng,
        location_name: location,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to store event location:', error);
    return false;
  }
};

// --- Map Bounds ---
export const calculateBounds = (
  points: Array<{ lat: number; lng: number }>
): {
  north: number;
  south: number;
  east: number;
  west: number;
} => {
  if (points.length === 0) {
    return {
      north: 0,
      south: 0,
      east: 0,
      west: 0,
    };
  }

  let north = points[0].lat;
  let south = points[0].lat;
  let east = points[0].lng;
  let west = points[0].lng;

  for (const point of points) {
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lng);
    west = Math.min(west, point.lng);
  }

  return { north, south, east, west };
};

// --- Location Privacy ---
export const obfuscateLocation = (
  lat: number,
  lng: number,
  radiusMeters: number = 100
): { lat: number; lng: number } => {
  // Add random offset within radius
  const randomAngle = Math.random() * 2 * Math.PI;
  const randomRadius = Math.random() * radiusMeters;

  const latOffset = (randomRadius * Math.cos(randomAngle)) / 111320;
  const lngOffset = (randomRadius * Math.sin(randomAngle)) / (111320 * Math.cos(lat * Math.PI / 180));

  return {
    lat: lat + latOffset,
    lng: lng + lngOffset,
  };
};

// --- Location History ---
export const saveLocationHistory = async (
  userId: string,
  latitude: number,
  longitude: number
): Promise<boolean> => {
  try {
    const locationName = reverseGeocode(latitude, longitude);

    const { error } = await supabase
      .from('location_history')
      .insert({
        user_id: userId,
        latitude,
        longitude,
        location_name: locationName,
        timestamp: new Date().toISOString(),
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to save location history:', error);
    return false;
  }
};

// --- Notifications ---
export const notifyNearbyFriends = async (
  userId: string,
  userName: string,
  nearbyFriendIds: string[]
): Promise<void> => {
  if (nearbyFriendIds.length === 0) return;

  try {
    const notifications = nearbyFriendIds.map((friendId) => ({
      user_id: friendId,
      type: 'friend_nearby',
      title: `${userName} is nearby!`,
      content: `${userName} is in your area. Say hi!`,
      data: { friend_id: userId },
    }));

    // TODO: Implement when notifications table is created
    console.log('Would send notifications to', notifications.length, 'friends');
  } catch (error) {
    console.error('Failed to send nearby notifications:', error);
  }
};

// --- Export all utilities ---
export default {
  calculateDistance,
  formatDistance,
  geocodeLocation,
  reverseGeocode,
  checkLocationPermission,
  requestLocationPermission,
  updateUserLocation,
  getFriendsWithinRadius,
  storeEventLocation,
  calculateBounds,
  obfuscateLocation,
  saveLocationHistory,
  notifyNearbyFriends,
};
