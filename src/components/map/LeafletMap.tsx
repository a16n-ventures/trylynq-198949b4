'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import 'leaflet/dist/leaflet.css';

export interface LeafletMapHandle {
  recenter: () => void;
}

interface FriendLocation {
  user_id: string;
  latitude: string | number | null;
  longitude: string | number | null;
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface LeafletMapProps {
  userLocation: { latitude: number; longitude: number } | null;
  friendsLocations: FriendLocation[];
  loading?: boolean;
  error?: string | null;
  mapStyle?: 'standard' | 'satellite';
}

const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(({
  userLocation,
  friendsLocations,
  loading,
  error,
  mapStyle = 'standard'
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  // Force mount check
  const [isMounted, setIsMounted] = useState(false);

  // Expose recenter
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (mapInstanceRef.current && userLocation) {
        mapInstanceRef.current.setView([userLocation.latitude, userLocation.longitude], 15, { animate: true });
      }
    }
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;

        // Default to Lagos
        const fallback: [number, number] = [6.5244, 3.3792];
        const center = userLocation 
          ? [userLocation.latitude, userLocation.longitude] as [number, number] 
          : fallback;

        console.log("Initializing map at:", center); // DEBUG LOG

        const map = L.map(mapContainerRef.current, {
          center: center,
          zoom: 13,
          zoomControl: false,
          attributionControl: false
        });

        // Add attribution
        L.control.attribution({ prefix: false }).addTo(map);

        mapInstanceRef.current = map;

        // FORCE RESIZE after a delay to ensure tiles load
        setTimeout(() => {
          map.invalidateSize();
          console.log("Map resized");
        }, 500);

      } catch (err) {
        console.error("Map initialization error:", err);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMounted]); // Only run once on mount

  // Handle Tile Layer
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateLayer = async () => {
      const L = (await import('leaflet')).default;
      
      if (tileLayerRef.current) mapInstanceRef.current.removeLayer(tileLayerRef.current);

      const standardUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      const url = mapStyle === 'satellite' ? satelliteUrl : standardUrl;

      tileLayerRef.current = L.tileLayer(url, { maxZoom: 19 }).addTo(mapInstanceRef.current);
    };

    updateLayer();
  }, [isMounted, mapStyle, mapInstanceRef.current]);

  // Update Markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;

      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // User Marker
      if (userLocation) {
        const userIcon = L.divIcon({
          className: 'bg-transparent',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;">
                  <div style="position:absolute;width:100%;height:100%;background:#3b82f6;border-radius:50%;opacity:0.7;animation:ping 1s infinite;"></div>
                  <div style="position:relative;width:16px;height:16px;background:#2563eb;border:2px solid white;border-radius:50%;"></div>
                 </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const m = L.marker([userLocation.latitude, userLocation.longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        markersRef.current.push(m);
      }

      // Friend Markers
      friendsLocations.forEach(friend => {
        const lat = typeof friend.latitude === 'string' ? parseFloat(friend.latitude) : friend.latitude;
        const lng = typeof friend.longitude === 'string' ? parseFloat(friend.longitude) : friend.longitude;

        if (lat && lng) {
          const avatar = friend.profiles?.avatar_url || "https://github.com/shadcn.png";
          const icon = L.divIcon({
            className: 'bg-transparent',
            html: `<div style="width:40px;height:40px;border-radius:50%;border:2px solid white;background-image:url('${avatar}');background-size:cover;box-shadow:0 4px 6px rgba(0,0,0,0.3);"></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });
          const m = L.marker([lat, lng], { icon }).addTo(map);
          markersRef.current.push(m);
        }
      });
    };

    updateMarkers();
  }, [userLocation, friendsLocations, mapInstanceRef.current]);

  if (!isMounted) return <div className="h-screen w-screen bg-gray-100 flex items-center justify-center">Loading Map...</div>;

  return (
    // FIX: Use fixed position to force full screen and z-index 0 to stay behind UI
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      {/* CSS Injection to override Tailwind */}
      <style>{`
        .leaflet-tile { max-width: none !important; max-height: none !important; }
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 1000 !important; }
      `}</style>

      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', background: '#e5e7eb' }}
      />

      {/* Loading State - Top Right to avoid blocking view if stuck */}
      {loading && (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 9999, background: 'white', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Locating...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{ position: 'absolute', top: 80, left: 20, right: 20, zIndex: 9999, background: '#ef4444', color: 'white', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default LeafletMap;
