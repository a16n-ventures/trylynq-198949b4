'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import 'leaflet/dist/leaflet.css';

export interface LeafletMapHandle {
  recenter: () => void;
}

interface FriendLocation {
  user_id: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  markerType?: 'friend' | 'event' | 'business';
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
  onMarkerSelect?: (id: string, markerType?: 'friend' | 'event' | 'business') => void;
  routeCoordinates?: [number, number][] | null; // ✅ Added prop for navigation route
}

const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(({
  userLocation,
  friendsLocations,
  loading,
  error,
  mapStyle = 'standard',
  onMarkerSelect,
  routeCoordinates // ✅ Destructure new prop
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayerRef = useRef<any>(null); // ✅ Ref to track the route line
  const [isMounted, setIsMounted] = useState(false);

  // Expose recenter method to parent
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (mapInstanceRef.current && userLocation) {
        mapInstanceRef.current.setView(
          [userLocation.latitude, userLocation.longitude], 
          15, 
          { animate: true }
        );
      }
    }
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;

        // Default: Lagos (Fallback if no location)
        const startCoords: [number, number] = userLocation 
          ? [userLocation.latitude, userLocation.longitude] 
          : [6.5244, 3.3792];

        const map = L.map(mapContainerRef.current, {
          center: startCoords,
          zoom: 14,
          zoomControl: false, // We use custom UI buttons
          attributionControl: false,
          fadeAnimation: true,
          zoomAnimation: true
        });

        // Add cleaner attribution
        L.control.attribution({ prefix: false }).addTo(map);

        mapInstanceRef.current = map;

        // CRITICAL FIX: Force map resize calculation after mount
        setTimeout(() => {
          map.invalidateSize();
        }, 100);

      } catch (err) {
        console.error("Map initialization failed:", err);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMounted]);

  // 2. Handle Map Style (Standard vs Satellite)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateLayer = async () => {
      const L = (await import('leaflet')).default;
      
      if (tileLayerRef.current) {
        mapInstanceRef.current.removeLayer(tileLayerRef.current);
      }

      const standardUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      
      const url = mapStyle === 'satellite' ? satelliteUrl : standardUrl;

      tileLayerRef.current = L.tileLayer(url, {
        maxZoom: 19,
        detectRetina: true
      }).addTo(mapInstanceRef.current);
    };

    updateLayer();
  }, [isMounted, mapStyle, mapInstanceRef.current]);

  // 3. Update Markers (User + Friends)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;

      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // --- USER MARKER ---
      if (userLocation) {
        const userIcon = L.divIcon({
          className: 'bg-transparent border-0',
          html: `
            <div class="relative flex items-center justify-center w-6 h-6">
              <span class="absolute w-full h-full bg-blue-500 rounded-full opacity-75 animate-ping"></span>
              <span class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-md"></span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const m = L.marker([userLocation.latitude, userLocation.longitude], { 
          icon: userIcon, 
          zIndexOffset: 1000 
        }).addTo(map);
        markersRef.current.push(m);
      }

      // --- FRIEND MARKERS ---
      friendsLocations.forEach(friend => {
        const lat = typeof friend.latitude === 'string' ? parseFloat(friend.latitude) : friend.latitude;
        const lng = typeof friend.longitude === 'string' ? parseFloat(friend.longitude) : friend.longitude;
      
        if (lat && lng) {
          const isEventMarker = friend.markerType === 'event';
          const isBusinessMarker = friend.markerType === 'business';
          const avatar = friend.profiles?.avatar_url || "https://github.com/shadcn.png";
          const statusBubble = (friend as any).status_bubble;
      
          const icon = L.divIcon({
            className: 'bg-transparent border-0',
            html: isEventMarker ? `
              <div style="
                width: 14px; height: 14px;
                background: radial-gradient(circle, rgba(139,92,246,0.95) 0%, rgba(139,92,246,0.35) 65%, transparent 100%);
                border-radius: 50%;
                box-shadow: 0 0 0 5px rgba(139,92,246,0.12), 0 0 14px rgba(139,92,246,0.45);
              "></div>
            ` : isBusinessMarker ? `
              <div style="
                width: 14px; height: 14px;
                background: radial-gradient(circle, rgba(6,182,212,0.95) 0%, rgba(6,182,212,0.35) 65%, transparent 100%);
                border-radius: 50%;
                box-shadow: 0 0 0 5px rgba(6,182,212,0.12), 0 0 14px rgba(6,182,212,0.45);
              "></div>
            ` : `
              <div class="relative flex flex-col items-center">
                ${statusBubble ? `
                  <div class="absolute -top-10 bg-primary text-white text-[10px] font-bold px-3 py-1.5 rounded-2xl shadow-xl animate-bounce whitespace-nowrap border-2 border-background z-50">
                    ${statusBubble}
                    <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rotate-45 border-r-2 border-b-2 border-background"></div>
                  </div>
                ` : ''}
                <div style="
                  width: 44px; height: 44px; 
                  border-radius: 50%; 
                  border: 3px solid white; 
                  background-image: url('${avatar}'); 
                  background-size: cover; 
                  box-shadow: 0 8px 15px rgba(0,0,0,0.2);
                  background-color: #e2e8f0;
                "></div>
              </div>
            `,
            iconSize: isEventMarker || isBusinessMarker ? [14, 14] : [120, 120],
            iconAnchor: isEventMarker || isBusinessMarker ? [7, 7] : [60, 60],
          });
      
          const m = L.marker([lat, lng], { icon }).addTo(map);
          m.on('click', () => onMarkerSelect?.(friend.user_id, friend.markerType));
          if (friend.profiles?.display_name) {
            m.bindPopup(`<div style="font-weight:600; text-align:center">${friend.profiles.display_name}</div>`);
          }
          markersRef.current.push(m);
        }
      });
    };

    updateMarkers();
  }, [userLocation, friendsLocations, onMarkerSelect]);

  // 4. ✅ Handle Route Rendering (New Logic)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const updateRoute = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;

      // Clear previous route
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      if (routeCoordinates && routeCoordinates.length > 0) {
        // Draw new route
        const polyline = L.polyline(routeCoordinates, {
          color: '#3b82f6', // Tailwind blue-500
          weight: 6,
          opacity: 0.8,
          lineJoin: 'round',
          lineCap: 'round',
          dashArray: undefined
        }).addTo(map);

        routeLayerRef.current = polyline;

        // Auto-zoom to show the entire route
        try {
          map.fitBounds(polyline.getBounds(), {
            padding: [50, 50],
            maxZoom: 16
          });
        } catch (e) {
          console.error("Error fitting bounds:", e);
        }
      }
    };

    updateRoute();
  }, [routeCoordinates]);

  if (!isMounted) return <div className="h-full w-full bg-muted flex items-center justify-center">Loading Map...</div>;

  return (
    // FIX: Using fixed positioning ensures the map fills the viewport regardless of parent constraints
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      
      {/* CRITICAL: Inject CSS to override Tailwind's img reset that breaks Leaflet tiles */}
      <style>{`
        .leaflet-tile { max-width: none !important; max-height: none !important; }
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 1000 !important; }
      `}</style>

      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', background: '#e5e7eb' }} 
      />

      {/* Loading Overlay */}
      {(!mapInstanceRef.current || loading) && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/50 backdrop-blur-sm pointer-events-none">
          <div className="bg-background px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Locating...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1001] bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
});

export default LeafletMap;
