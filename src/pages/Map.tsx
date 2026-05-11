import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Users, Loader2, X, Ticket,
  Globe, Layers, Radar, CornerUpRight, Sparkles, UserPlus, Rocket, Flame, ShieldCheck, Briefcase, Star
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { ContactImportModal } from '@/components/ContactImportModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { EventFilterBar, applyEventFilters } from '@/components/events/EventFilterBar';
import { useEventFilters } from '@/hooks/useEventFilters';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { TicketTierSelector } from '@/components/events/TicketTierSelector';
import { formatTicketPrice as fmtTicket } from '@/lib/eventFormat';

type CityMilestone = {
  city_name: string;
  center_lat: number;
  center_long: number;
  radius_km: number | null;
};

// --- Types ---
type FriendOnMap = {
  id: string;
  user_id: string;
  name: string;
  avatar?: string;
  locationLabel: string;
  coordinates?: { lat: number; lng: number } | null;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_premium?: boolean;
  is_verified?: boolean;
  user_type?: string;
  profiles?: { display_name?: string | null; avatar_url?: string | null } | null;
};

// --- Helpers ---
const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; 
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatTicketPrice = fmtTicket;
 
const PremiumBadge = () => (
  <span className="inline-flex items-center justify-center bg-blue-500 text-white text-[8px] font-bold px-1 rounded-sm ml-1 h-3.5">
    PRO
  </span>
);

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  // Global State
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  const [geocodedCity, setGeocodedCity] = useState<string | null>(null); 
  const { isInLaunchZone, isWithinCity, isLoading: launchZoneLoading, currentCount, targetCount, cityName: launchCityName }
  = useLaunchZone(location?.latitude, location?.longitude, geocodedCity);
  const { friends = [] } = useFriends(user?.id);

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [showContactImport, setShowContactImport] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events' | 'businesses'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [filters, setFilters] = useEventFilters();
  const { isPremium } = usePremiumStatus(user?.id);
  const [tierSheetOpen, setTierSheetOpen] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // --- 1. Fetch Friend Data ---
  const friendIds = useMemo(() => {
    if (!user || !friends) return [];
    return friends.map((f: any) => 
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    ).filter(Boolean);
  }, [friends, user]);

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return [];
      const { data } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location, updated_at')
        .in('user_id', friendIds);
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
    refetchInterval: 30000, 
  }); 
  
  // --- FIXED: Fetch all necessary profile meta for friends (Premium & Trust) ---
  const { data: friendMeta = {} } = useQuery({
    queryKey: ['friend-meta', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return {};
      const { data } = await supabase
        .from('profiles')
        .select('user_id, is_premium, user_type, verification_status') 
        .in('user_id', friendIds);
      
      const metaMap: Record<string, any> = {};
      data?.forEach(p => { metaMap[p.user_id] = p; });
      return metaMap;
    },
    enabled: friendIds.length > 0,
  }); 

  // --- 2. Process Friends (Discovery Logic) ---
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('preferences, user_type').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id
  });

  const { data: cityMilestone } = useQuery({
    queryKey: ['map-city-milestone', location?.latitude, location?.longitude],
    queryFn: async (): Promise<CityMilestone | null> => {
      if (!location) return null;
      const { data, error } = await supabase
        .from('city_milestones')
        .select('city_name, center_lat, center_long, radius_km');
      if (error || !data) return null;
      return data
        .map((m) => ({ ...m, dist: distanceKm(location.latitude, location.longitude, m.center_lat, m.center_long) }))
        .filter((m) => m.dist <= (m.radius_km ?? 25))
        .sort((a, b) => a.dist - b.dist)[0] || null;
    },
    enabled: !!location,
  });

  const discoveryRadiusKm = useMemo(() => {
    const prefs = userProfile?.preferences as { discovery_radius?: number } | null;
    const km = (prefs?.discovery_radius ?? 25000) / 1000; // Default 25km
    return Math.min(25, Math.max(5, km)); // Clamp between 5km and 25km
  }, [userProfile]);

  // --- 3. Process & Sort Friends ---
  const nearbyFriendsRaw = useMemo(() => {
    if (!location) return [];
    const uniqueFriendsMap = new Map();
    friends.forEach((friendship: any) => {
      const isRequester = friendship.requester_id === user?.id;
      const profile = isRequester ? friendship.addressee : friendship.requester;
      const friendId = isRequester ? friendship.addressee_id : friendship.requester_id;
      const loc = friendLocations.find(l => l.user_id === friendId);
      if (loc && loc.latitude && loc.longitude) {
        uniqueFriendsMap.set(friendId, {
          user_id: friendId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updated_at: loc.updated_at,
          is_sharing: loc.is_sharing_location,
          profiles: { display_name: profile?.display_name || 'Friend', avatar_url: profile?.avatar_url }
        });
      }
    });
    return Array.from(uniqueFriendsMap.values());
  }, [friends, friendLocations, location, user?.id]);

  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    
    return (nearbyFriendsRaw
      .map((loc: any) => {
        const dist = distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude);
        if (dist > discoveryRadiusKm) return null; // Radius Filter

        const online = friendsPresence[loc.user_id] === 'online';
        let statusText = 'Offline';
        if (online) statusText = 'Active now';
        else if (!loc.is_sharing) statusText = 'Location paused';
        else statusText = 'Active recently';

        return {
          id: loc.user_id,
          user_id: loc.user_id,
          name: loc.profiles?.display_name || 'Friend',
          avatar: loc.profiles?.avatar_url,
          locationLabel: 'On the map',
          coordinates: { lat: loc.latitude, lng: loc.longitude },
          status: online ? 'online' : 'offline',
          lastSeen: statusText,
          distanceKm: Number(dist.toFixed(1)),
          latitude: loc.latitude,
          longitude: loc.longitude,
          is_premium: friendMeta[loc.user_id]?.is_premium || false,
          user_type: friendMeta[loc.user_id]?.user_type || 'personal',
          is_verified: friendMeta[loc.user_id]?.verification_status === 'verified',
          profiles: loc.profiles
        };
      })
      .filter(Boolean) as FriendOnMap[])
      // ✅ SORTING: NEAREST FIRST
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  }, [nearbyFriendsRaw, friendsPresence, location, discoveryRadiusKm]);

  // --- 4. Events: shared source of truth (uses event_locations + city_milestone origin) ---
  const {
    events: nearbyEvents,
    isLoading: eventsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    originLabel,
    effectiveRadiusKm,
  } = useNearbyEvents({
    userLocation: location,
    cityCenter: cityMilestone
      ? { latitude: cityMilestone.center_lat, longitude: cityMilestone.center_long }
      : null,
    radiusKm: discoveryRadiusKm,
    isPremium,
    userId: user?.id ?? null,
    friendIds,
  });

  const events = useMemo(() => applyEventFilters(nearbyEvents as any, filters), [nearbyEvents, filters]);

  // --- 4b. Nearby Business Profiles (businesses view) ---
  const { data: nearbyBusinesses = [], isLoading: businessesLoading } = useQuery({
    queryKey: ['nearby-businesses', location?.latitude, location?.longitude, discoveryRadiusKm],
    queryFn: async () => {
      if (!location) return [];
      // Fetch verified business profiles that have a lat/lng within the discovery radius.
      // We pull from user_locations (same pattern as events) joined to profiles.
      const { data, error } = await supabase
        .from('user_locations')
        .select(`
          user_id,
          latitude,
          longitude,
          updated_at,
          profiles!inner (
            display_name,
            avatar_url,
            bio,
            user_type,
            verification_status,
            skills,
            is_premium
          )
        `)
        .eq('profiles.user_type', 'business')
        .eq('profiles.verification_status', 'verified')
        .eq('is_sharing_location', true);

      if (error || !data) return [];

      return data
        .map((row: any) => {
          const dist = distanceKm(
            location.latitude, location.longitude,
            row.latitude, row.longitude
          );
          if (dist > discoveryRadiusKm) return null;
          return {
            id: row.user_id,
            user_id: row.user_id,
            name: row.profiles?.display_name || 'Business',
            avatar: row.profiles?.avatar_url,
            bio: row.profiles?.bio,
            skills: row.profiles?.skills || [],
            is_premium: row.profiles?.is_premium || false,
            is_verified: true, // only verified businesses are fetched
            latitude: row.latitude,
            longitude: row.longitude,
            distanceKm: Number(dist.toFixed(1)),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.distanceKm - b.distanceKm);
    },
    enabled: !!location && activeView === 'businesses',
    refetchInterval: 60000,
  });

  const nearbyEventsForMap = useMemo(() => {
    return events.map((e: any) => ({
      user_id: e.id, 
      latitude: e.latitude,
      longitude: e.longitude,
      markerType: 'event' as const,
      is_sharing: true, 
      updated_at: new Date().toISOString(),
      profiles: { display_name: e.title, avatar_url: e.image_url }
    }));
  }, [events]);

  const nearbyBusinessesForMap = useMemo(() => {
    return nearbyBusinesses.map((b: any) => ({
      user_id: b.id,
      latitude: b.latitude,
      longitude: b.longitude,
      markerType: 'event' as const, // reuse event pin style; LeafletMap already handles this
      is_sharing: true,
      updated_at: new Date().toISOString(),
      profiles: { display_name: b.name, avatar_url: b.avatar }
    }));
  }, [nearbyBusinesses]);

  const handleMarkerSelect = (id: string, markerType?: 'friend' | 'event') => {
    if (activeView === 'businesses') {
      const biz = nearbyBusinesses.find((b: any) => b.id === id);
      if (biz) {
        setSelectedFriend(null);
        setSelectedEvent(null);
        setSelectedBusiness(biz);
      }
      return;
    }
    if (markerType === 'event' || activeView === 'events') {
      const event = events.find((e: any) => e.id === id);
      if (event) {
        setSelectedFriend(null);
        setSelectedBusiness(null);
        setSelectedEvent(event);
      }
      return;
    }
    const friend = friendsMapped.find((f) => f.id === id || f.user_id === id);
    if (friend) {
      setSelectedEvent(null);
      setSelectedBusiness(null);
      setSelectedFriend(friend);
    }
  };

  // --- 5. Ghost Mode ---
  useEffect(() => {
    if (!user) return;
    supabase.from('user_locations').select('is_sharing_location').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setIsGhostMode(!data.is_sharing_location); });

    const channel = supabase.channel('online-users', { config: { presence: { key: user.id } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const next: any = {};
      Object.keys(state).forEach(k => { next[k] = 'online'; });
      setFriendsPresence(next);
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') channel.track({ online: true });
    });
    return () => { channel.unsubscribe(); };
  }, [user]);

  const toggleGhostMode = async () => {
    if (!user) return;
    const newValue = !isGhostMode;
    await supabase.from('user_locations').upsert({ 
      user_id: user.id, is_sharing_location: !newValue, updated_at: new Date().toISOString()
    } as any);
    setIsGhostMode(newValue);
    toast.success(newValue ? "Ghost Mode On 👻" : "You are visible on map");
  };

  // --- 6. Navigation ---
  const handleGetDirections = async (destLat: number, destLng: number, destName: string) => {
    if (!location) return toast.error("Location unavailable");
    setIsRouting(true);
    setNavigationTarget({ lat: destLat, lng: destLng, name: destName });
    setIsNavigating(true);
    setSelectedFriend(null);
    setSelectedEvent(null);

    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${location.longitude},${location.latitude};${destLng},${destLat}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const coords = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
        setRouteCoordinates(coords);
      } else {
        toast.error("Route not found");
      }
    } catch {
      toast.error("Routing failed");
    } finally {
      setIsRouting(false);
    }
  };

  // RSVP toggle from map sheet
  const handleToggleRSVP = async (ev: any) => {
    if (!user) return toast.error('Please sign in to RSVP');
    if (!ev) return;
    const wasGoing = !!ev.is_attending;
    setSelectedEvent({ ...ev, is_attending: !wasGoing });
    try {
      if (wasGoing) {
        await supabase.from('event_attendees').delete().match({ event_id: ev.id, user_id: user.id });
        toast.success('RSVP cancelled');
      } else {
        await supabase.from('event_attendees').insert({ event_id: ev.id, user_id: user.id, status: 'confirmed' });
        toast.success("You're going! 🎉");
      }
    } catch (e: any) {
      setSelectedEvent(ev);
      toast.error(e.message || 'Action failed');
    }
  };

  // Infinite scroll observer for the horizontal event list
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || activeView !== 'events') return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [activeView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = activeView === 'friends' ? friendsMapped : activeView === 'businesses' ? nearbyBusinesses : events;
    if (!q) return list;
    return list.filter((item: any) => (item.name || item.title).toLowerCase().includes(q));
  }, [searchQuery, friendsMapped, events, nearbyBusinesses, activeView]);
  
  const handleCityResolved = useCallback((city: string) => {
    setGeocodedCity(prev => prev === city ? prev : city);
  }, []);

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={!!launchCityName}
      isInLaunchZone={isInLaunchZone}
      cityName={launchCityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0} 
      onCityResolved={handleCityResolved}
    >
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        
        {/* LAYER 1: MAP */}
        <div className="absolute inset-0 z-0 h-full w-full">
          <LeafletMap
            ref={mapRef}
            userLocation={location}
            friendsLocations={activeView === 'friends' ? friendsMapped : activeView === 'businesses' ? nearbyBusinessesForMap : nearbyEventsForMap}
            loading={locationLoading || (activeView === 'events' && eventsLoading) || (activeView === 'businesses' && businessesLoading)}
            error={locationError}
            mapStyle={mapStyle} 
            onMarkerSelect={handleMarkerSelect}
            routeCoordinates={routeCoordinates}
          />
        </div>
        
        {/* LAYER 2: CLYX UI OVERLAY */}
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          
          {/* A. COMMAND ISLAND */}
          {!isNavigating && (
            <div className="pt-safe-top px-4 mt-4 pointer-events-auto">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 h-12 bg-background/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg flex items-center px-4">
                    <Search className="w-5 h-5 text-muted-foreground mr-3" />
                    <Input 
                      placeholder={activeView === 'friends' ? "Find friends..." : activeView === 'businesses' ? "Find a service..." : "Find vibes..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent border-0 h-full focus-visible:ring-0 p-0 text-base"
                    />
                  </div>
                  
                  <Button 
                    size="icon" 
                    className={`h-12 w-12 rounded-2xl shadow-lg border border-white/10 ${isGhostMode ? "bg-purple-600 text-white" : "bg-background/80 backdrop-blur-xl text-foreground"}`}
                    onClick={toggleGhostMode}
                  >
                    {isGhostMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5 text-white" />}
                  </Button>
                </div>

                  <div className="flex justify-between items-center w-full">
                    <div className="bg-background/80 backdrop-blur-xl border border-white/10 rounded-full p-1 flex shadow-lg">
                      <button 
                        onClick={() => setActiveView('friends')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'friends' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:bg-white/10'}`}
                      >
                        {userProfile?.user_type === 'business' ? 'Customer Heatmap' : 'Friends'}
                      </button>
                      <button 
                        onClick={() => setActiveView('events')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'events' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:bg-white/10'}`}
                      >
                        {userProfile?.user_type === 'business' ? 'Marketplace' : 'Events'}
                      </button>
                      <button
                        onClick={() => setActiveView('businesses')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'businesses' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:bg-white/10'}`}
                      >
                        Businesses
                      </button>
                    </div>
    
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 rounded-full bg-background/60 backdrop-blur-md shadow-sm border border-white/10"
                      onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
                    >
                      {mapStyle === 'standard' ? <Globe className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                    </Button>
                </div>

                {activeView === 'events' && (
                  <div className="bg-background/70 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-lg">
                    <EventFilterBar value={filters} onChange={setFilters} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-grow" />

          {/* B. BOTTOM SHEET - Positioned above bottom navigation */}
          <div className="pointer-events-auto px-4 pb-2 z-[60] mb-20 max-h-[45vh] flex flex-col justify-end">
            
            {/* Recenter FAB */}
            {!selectedFriend && !selectedEvent && !isNavigating && (
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => location ? mapRef.current?.recenter() : requestLocation()}
                  className="rounded-full h-12 w-12 shadow-xl bg-background/90 text-primary border border-white/20"
                >
                  {locationLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Crosshair className="h-6 w-6 text-white" />}
                </Button>
              </div>
            )}

            {/* 1. NAVIGATION ACTIVE CARD */}
            {isNavigating && navigationTarget && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-blue-500 font-bold mb-1 text-xs uppercase tracking-wider animate-pulse">
                        <Navigation className="w-3 h-3" /> Navigating
                      </div>
                      <h3 className="font-bold text-xl leading-tight">{navigationTarget.name}</h3>
                      <p className="text-sm text-muted-foreground">{isRouting ? "Routing..." : "Follow path on map"}</p>
                    </div>
                    <div className="flex gap-2">
                       <Button size="icon" variant="destructive" className="rounded-full h-12 w-12" onClick={() => { setIsNavigating(false); setRouteCoordinates(null); }}>
                        <X className="w-6 h-6" />
                      </Button>
                      <Button size="icon" className="rounded-full h-12 w-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.open(`http://maps.google.com/maps?q=${navigationTarget.lat},${navigationTarget.lng}`, '_blank')}>
                        <CornerUpRight className="w-6 h-6" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. FRIEND CARD */}
            {!isNavigating && selectedFriend && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar className="w-16 h-16 border-4 border-background shadow-md">
                          <AvatarImage src={selectedFriend.avatar} />
                          <AvatarFallback>{selectedFriend.name[0]}</AvatarFallback>
                        </Avatar>
                        {selectedFriend.status === 'online' && (
                          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background ring-2 ring-green-500/20" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-xl flex items-center gap-2">
                          {selectedFriend.name}
                          {selectedFriend.is_verified && <ShieldCheck className="w-5 h-5 text-primary" />}
                          {selectedFriend.is_premium && <PremiumBadge />}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-full">
                            <MapPin className="w-3 h-3" /> {selectedFriend.distanceKm}km
                          </span>
                          <span className="text-xs">• {selectedFriend.lastSeen}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedFriend(null)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      className="h-12 rounded-xl text-base font-semibold bg-primary/10 text-white hover:bg-primary/20 border-0"
                      onClick={() => navigate(`/app/messages?type=dm&id=${selectedFriend.id}`)}
                    >
                      <MessageCircle className="w-5 h-5 mr-2" /> Message
                    </Button>
                    <Button 
                      className="h-12 rounded-xl text-base font-semibold shadow-lg bg-primary hover:bg-primary/90 text-white"
                      onClick={() => handleGetDirections(selectedFriend.latitude!, selectedFriend.longitude!, selectedFriend.name)}
                    >
                      <Navigation className="w-5 h-5 mr-2" /> Meet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 3. EVENT CARD */}
            {!isNavigating && selectedEvent && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                
                <div className="relative h-32 w-full">
                  <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                  
                  {/* --- ADDED: High Vibe Pulse Badge --- */}
                  {selectedEvent.is_vibe && (
                    <Badge className="absolute top-2 left-2 bg-orange-500 text-white animate-pulse border-0 shadow-lg">
                      <Flame className="w-3 h-3 mr-1" /> HIGH VIBE
                    </Badge>
                  )}
                  
                  <Button variant="secondary" size="icon" className="absolute top-2 right-2 rounded-full h-8 w-8 shadow-md" onClick={() => setSelectedEvent(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <CardContent className="p-5 pt-2">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <Badge variant="secondary" className="mb-2 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                        {format(new Date(selectedEvent.start_date), 'MMM d, h:mm a')}
                      </Badge>
                      <h3 className="font-bold text-xl leading-tight">{selectedEvent.title}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5" /> {selectedEvent.location}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="rounded-xl bg-muted/30 border border-border/50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        From {originLabel === 'city' ? (cityMilestone?.city_name || 'city') : 'you'}
                      </p>
                      <p className="text-sm font-black">{selectedEvent.distanceKm}km</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 border border-border/50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ticket</p>
                      <p className="text-sm font-black">{formatTicketPrice(selectedEvent.ticket_price)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 border border-border/50 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Others Going</p>
                      <p className="text-sm font-black">{selectedEvent.attendee_count || 0}</p>
                    </div>
                  </div>
                  {selectedEvent.is_attending && (
                    <Badge className="mb-3 bg-green-600 text-white border-0">✓ You're going</Badge>
                  )}

                  {(selectedEvent.friends_going_count || 0) > 0 ? (
                    <div className="flex items-center justify-between mb-5 bg-muted/30 p-2.5 rounded-xl border border-border/50">
                      <div className="flex items-center -space-x-3">
                        {selectedEvent.friend_images.map((img: string, i: number) => (
                          <Avatar key={i} className="w-8 h-8 border-2 border-background">
                            <AvatarImage src={img} />
                          </Avatar>
                        ))}
                        {selectedEvent.friends_going_count > selectedEvent.friend_images.length && (
                          <div className="w-8 h-8 rounded-full bg-background border-2 border-muted flex items-center justify-center text-[10px] font-bold z-10 shadow-sm">
                            +{selectedEvent.friends_going_count - selectedEvent.friend_images.length}
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-medium text-right">
                        <p className="text-primary">{selectedEvent.friends_going_count} {selectedEvent.friends_going_count === 1 ? 'friend' : 'friends'}</p>
                        <p className="text-muted-foreground">going too</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-5 bg-muted/30 p-2.5 rounded-xl border border-border/50 text-center text-xs text-muted-foreground">
                      None of your friends are going yet
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl text-xs font-semibold"
                      onClick={() => { setSelectedTierId(null); setTierSheetOpen(true); }}
                    >
                      <Ticket className="w-4 h-4 mr-1" /> Tickets
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl text-xs font-semibold"
                      onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}
                    >
                      <MessageCircle className="w-4 h-4 mr-1" /> Chat
                    </Button>
                    <Button
                      className="h-11 rounded-xl text-xs font-semibold shadow-lg bg-primary hover:bg-primary/90 text-white"
                      onClick={() => handleGetDirections(selectedEvent.latitude, selectedEvent.longitude, selectedEvent.title)}
                    >
                      <Navigation className="w-4 h-4 mr-1" /> Go
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedEvent.is_attending ? 'success' : 'outline'}
                      className="h-12 rounded-xl font-bold"
                      onClick={() => handleToggleRSVP(selectedEvent)}
                    >
                      {selectedEvent.is_attending ? '✓ Going' : 'RSVP'}
                    </Button>
                    <Button
                      className="h-12 rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-white font-bold"
                      onClick={() => { setSelectedTierId(null); setTierSheetOpen(true); }}
                    >
                      <Ticket className="w-5 h-5 mr-2" />
                      {(selectedEvent.ticket_price ?? 0) > 0 ? formatTicketPrice(selectedEvent.ticket_price) : 'Free'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 3b. BUSINESS CARD */}
            {!isNavigating && selectedBusiness && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-400" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar className="w-16 h-16 border-4 border-background shadow-md">
                          <AvatarImage src={selectedBusiness.avatar} />
                          <AvatarFallback>{selectedBusiness.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5 border-2 border-background">
                          <ShieldCheck className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-xl flex items-center gap-2">
                          {selectedBusiness.name}
                          {selectedBusiness.is_premium && <PremiumBadge />}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-full">
                            <MapPin className="w-3 h-3" /> {selectedBusiness.distanceKm}km away
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedBusiness(null)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  {selectedBusiness.bio && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{selectedBusiness.bio}</p>
                  )}

                  {selectedBusiness.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {selectedBusiness.skills.slice(0, 4).map((skill: string) => (
                        <span key={skill} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          {skill}
                        </span>
                      ))}
                      {selectedBusiness.skills.length > 4 && (
                        <span className="text-[10px] text-muted-foreground px-2 py-0.5">+{selectedBusiness.skills.length - 4} more</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="h-12 rounded-xl text-base font-semibold bg-primary/10 text-white hover:bg-primary/20 border-0"
                      onClick={() => navigate(`/app/messages?type=dm&id=${selectedBusiness.id}`)}
                    >
                      <MessageCircle className="w-5 h-5 mr-2" /> Message
                    </Button>
                    <Button
                      className="h-12 rounded-xl text-base font-semibold shadow-lg bg-primary hover:bg-primary/90 text-white"
                      onClick={() => handleGetDirections(selectedBusiness.latitude, selectedBusiness.longitude, selectedBusiness.name)}
                    >
                      <Navigation className="w-5 h-5 mr-2" /> Directions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 4. DEFAULT LIST */}
            {!isNavigating && !selectedFriend && !selectedEvent && !selectedBusiness && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
                {activeView === 'friends' && (
                  <div className="flex-shrink-0 w-36 snap-start">
                    <Button 
                      variant="outline" 
                      className="w-full h-40 rounded-3xl border-dashed border-2 flex flex-col gap-2 hover:bg-accent/50"
                      onClick={() => navigate('/app/friends')}
                      >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium">Invite Friends</span>
                    </Button>
                  </div>
                )}
                
                {(activeView === 'friends' ? friendsMapped : activeView === 'businesses' ? nearbyBusinesses : events).map((item: any) => (
                  <div
                    key={item.id}
                    className="flex-shrink-0 w-36 h-40 p-3 rounded-3xl bg-background/90 backdrop-blur-xl border border-white/10 shadow-lg cursor-pointer hover:scale-105 transition-transform snap-start flex flex-col items-center justify-center gap-2 text-center"
                    onClick={() => {
                      if (activeView === 'friends') setSelectedFriend(item);
                      else if (activeView === 'businesses') setSelectedBusiness(item);
                      else setSelectedEvent(item);
                    }}
                  >
                    <div className="relative">
                      <Avatar className={`w-14 h-14 shadow-md ${item.is_vibe ? 'ring-2 ring-orange-500 ring-offset-2 animate-pulse' : ''}`}>
                        <AvatarImage src={item.avatar || item.image_url} className="object-cover" />
                        <AvatarFallback>{item.name?.[0] || item.title?.[0]}</AvatarFallback>
                      </Avatar>
                      {activeView === 'friends' && item.status === 'online' && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
                      )}
                      {activeView === 'businesses' && (
                        <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5 border-2 border-background">
                          <ShieldCheck className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="w-full px-1">
                      <h4 className="font-bold text-sm truncate">{item.name || item.title} {item.is_verified && activeView !== 'businesses' && <ShieldCheck className="w-3 h-3 text-primary" />}</h4>
                      <p className="text-[10px] text-muted-foreground font-medium flex items-center justify-center gap-1 truncate">
                        <MapPin className="w-3 h-3" /> {activeView === 'events' ? item.location : `${item.distanceKm}km`}
                      </p>
                      {activeView === 'events' && (
                        <p className="text-[10px] font-bold text-primary">{item.distanceKm}km • {formatTicketPrice(item.ticket_price)}</p>
                      )}
                      {activeView === 'businesses' && item.skills?.length > 0 && (
                        <p className="text-[10px] text-primary font-medium truncate">{item.skills[0]}</p>
                      )}
                    </div>
                  </div>
                ))}
                {activeView === 'events' && hasNextPage && (
                  <div ref={sentinelRef} className="flex-shrink-0 w-20 h-40 flex items-center justify-center text-xs text-muted-foreground">
                    {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : '…'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <TicketTierSelector
          eventId={selectedEvent?.id}
          open={tierSheetOpen}
          onOpenChange={setTierSheetOpen}
          fallbackPrice={selectedEvent?.ticket_price}
          selectedTierId={selectedTierId}
          onSelectTier={setSelectedTierId}
          onConfirm={(tier) => {
            setTierSheetOpen(false);
            if (!selectedEvent) return;
            const tierParam = tier && tier.id !== '__default__' ? `&tier=${tier.id}` : '';
            navigate(`/app/events/${selectedEvent.id}?action=buy${tierParam}`);
          }}
        />
      </div> 
    </LaunchZoneGuard>
  );
};

export default MapPage;
