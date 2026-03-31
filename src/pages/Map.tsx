import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Users, Loader2, X, 
  Globe, Layers, Radar, CornerUpRight, Sparkles, UserPlus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

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

const PremiumBadge = () => (
  <span className="inline-flex items-center justify-center bg-blue-500 text-white text-[8px] font-bold px-1 rounded-sm ml-1 h-3.5">
    PRO
  </span>
);

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  // Global State
  const { location, requestLocation, isLoading: locationLoading, error: locationError, locationName } = useGeolocation();
  const { friends = [] } = useFriends(user?.id);

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');
  
  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [isRouting, setIsRouting] = useState(false); 
  
  const { data: feedData } = useQuery({
    queryKey: ['smart-feed', user?.id, location?.latitude?.toFixed(2), location?.longitude?.toFixed(2)],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('generate-smart-feed', {
        body: { user_id: user?.id, user_lat: location?.latitude, user_long: location?.longitude }
      });
      return data;
    },
    enabled: !!user && !!location,
  });
  
  const milestone = feedData?.milestone;
  const isUnlocked = milestone?.is_unlocked;
  const isLaunchZone = milestone?.is_launch_zone;

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
        .select('user_id, latitude, longitude, is_sharing_location, status_bubble, updated_at')
        .in('user_id', friendIds);
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
    refetchInterval: 30000, 
  }); 
  
  const { data: premiumStatus = {} } = useQuery({
    queryKey: ['premium-status', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return {};
      const { data } = await supabase
        .from('profiles')
        .select('user_id, is_premium')
        .in('user_id', friendIds);
      
      const statusMap: Record<string, boolean> = {};
      data?.forEach(p => {
        statusMap[p.user_id] = p.is_premium || false;
      });
      return statusMap;
    },
    enabled: friendIds.length > 0,
  });

  // --- 2. Process Friends (Discovery Logic) ---
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('preferences').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id
  });

  const discoveryRadiusKm = useMemo(() => {
    const prefs = userProfile?.preferences as { discovery_radius?: number } | null;
    return (prefs?.discovery_radius ?? 20000) / 1000; // Default 20km for Map (wider than feed)
  }, [userProfile]);

  const nearbyFriendsRaw = useMemo(() => {
    if (!location) return [];
    const uniqueFriendsMap = new Map();
    friends.forEach((friendship: any) => {
      const isRequester = friendship.requester_id === user?.id;
      const profile = isRequester ? friendship.addressee : friendship.requester;
      const friendId = isRequester ? friendship.addressee_id : friendship.requester_id;
      const loc = friendLocations.find((l: any) => l.user_id === friendId);
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

  // --- FIX: Move events query BEFORE friendsMapped so it's declared before use ---
  // --- 4. Events (With Clyx "Decide" Data) ---
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'nearby', location?.latitude, location?.longitude, discoveryRadiusKm],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('events')
        .select('*, event_attendees(user_id, profiles(avatar_url))')
        .gt('start_date', new Date().toISOString())
        .eq('is_public', true);
      if (!data) return [];

      return (data.map((e: any) => {
        const eLat = e.latitude || 6.5244; 
        const eLng = e.longitude || 3.3792;
        const dist = distanceKm(location.latitude, location.longitude, eLat, eLng);
        
        if (dist > discoveryRadiusKm) return null;

        const friendImages = e.event_attendees?.map((a: any) => a.profiles?.avatar_url).filter(Boolean).slice(0, 3) || [];

        return {
          id: e.id,
          title: e.title,
          location: e.location,
          start_date: e.start_date,
          image_url: e.image_url,
          latitude: eLat,
          longitude: eLng,
          distanceKm: Number(dist.toFixed(1)),
          friend_images: friendImages,
          attendee_count: e.event_attendees?.length || 0
        };
      }).filter(Boolean))
      .sort((a: any, b: any) => (a.distanceKm || 0) - (b.distanceKm || 0));
    },
    enabled: !!location && activeView === 'events',
  });

  // --- 3. Process & Sort Friends ---
  // (Moved after events query so `events` is in scope for the dependency array)
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    
    // Detect if ABU Zaria is currently in "Stealth Mode"
    const isCityLocked = events && events.length > 0 && (events[0] as any)?.is_locked;
    
    // Stealth mode logic: If it's a launch zone and NOT unlocked yet
    const isStealthActive = isLaunchZone && !isUnlocked;
  
    return (nearbyFriendsRaw
      .map((loc: any) => {
        // Original Distance Calculation
        const dist = distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude);
        if (dist > discoveryRadiusKm) return null;

        // Original Presence/Status Logic
        const online = friendsPresence[loc.user_id] === 'online';
        let statusText = 'Offline';
        if (online) statusText = 'Active now';
        else if (!loc.is_sharing) statusText = 'Location paused';
        else statusText = 'Active recently';

        // Stealth Mode "Fuzzing"
        const displayLat = isCityLocked ? loc.latitude + (Math.random() - 0.5) * 0.003 : loc.latitude;
        const displayLng = isCityLocked ? loc.longitude + (Math.random() - 0.5) * 0.003 : loc.longitude;

        return {
          id: loc.user_id,
          user_id: loc.user_id,
          name: isStealthActive ? "Pioneer" : loc.profiles?.display_name,
          avatar: isStealthActive ? null : loc.profiles?.avatar_url,
          is_stealth: isStealthActive, // Pass this flag to the card
          locationLabel: isCityLocked ? 'Stealth Mode' : 'On the map',
          coordinates: { lat: displayLat, lng: displayLng },
          status: online ? 'online' : 'offline',
          lastSeen: statusText,
          distanceKm: Number(dist.toFixed(1)),
          latitude: isStealthActive ? loc.latitude + (Math.random() - 0.5) * 0.002 : loc.latitude,
          longitude: isStealthActive ? loc.longitude + (Math.random() - 0.5) * 0.002 : loc.longitude,
          is_premium: premiumStatus[loc.user_id] || false,
          profiles: loc.profiles,
          is_pulse: isCityLocked
        };
      })
      .filter(Boolean) as FriendOnMap[])
      // Sort: NEAREST FIRST
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  }, [nearbyFriendsRaw, isLaunchZone, isUnlocked, friendsPresence, location, discoveryRadiusKm, premiumStatus, events]);

  const nearbyEventsForMap = useMemo(() => {
    return events.map((e: any) => ({
      user_id: e.id, 
      latitude: e.latitude,
      longitude: e.longitude,
      is_sharing: true, 
      updated_at: new Date().toISOString(),
      profiles: { display_name: e.title, avatar_url: e.image_url }
    }));
  }, [events]);

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
  
  useEffect(() => {
  if (!user) return;

  // Listen for changes specifically in the user_locations table
  const channel = supabase
    .channel('public:user_locations')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_locations',
      },
      (payload) => {
        const updatedLocation = payload.new;
        
        // Update the React Query cache so the UI re-renders instantly
        queryClient.setQueryData(['friend-locations', friendIds], (oldData: any[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((loc) => 
            loc.user_id === updatedLocation.user_id 
              ? { ...loc, status_bubble: updatedLocation.status_bubble } 
              : loc
          );
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user, friendIds, queryClient]);

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
  
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = activeView === 'friends' ? friendsMapped : events;
    if (!q) return list;
    return list.filter((item: any) => (item.name || item.title).toLowerCase().includes(q));
  }, [searchQuery, friendsMapped, events, activeView]);
  
  const isLowDensity = friendsMapped.length < 5;
  const showGlobalDiscovery = isLowDensity && activeView === 'friends';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      
      {/* LAYER 1: MAP */}
      <div className={`absolute inset-0 z-0 h-full w-full transition-all duration-700 ${(!isUnlocked && !isLaunchZone) ? 'blur-xl grayscale pointer-events-none' : ''}`}>
        <LeafletMap
          ref={mapRef}
          userLocation={location}
          friendsLocations={activeView === 'friends' ? friendsMapped : []}
          loading={locationLoading}
          error={locationError}
          mapStyle={mapStyle} 
          routeCoordinates={routeCoordinates}
        />
      </div>

      {/* LAYER 2: CLYX UI OVERLAY */}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
        
        {/* A. COMMAND ISLAND */}
        {!isNavigating && (
          <div className="pt-safe-top px-4 mt-4 pointer-events-auto">
            <div className="flex flex-col gap-3">
              
              {/* ZARIA STEALTH MODE INDICATOR */}
              {events.length > 0 && (events[0] as any).is_locked && (
                <div className="mb-1 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-2xl p-3 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-2">
                    <Radar className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      Zaria Stealth Mode: 342/500 Joined
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-primary/50 text-primary">LOCKED</Badge>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1 h-12 bg-background/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg flex items-center px-4">
                  <Search className="w-5 h-5 text-muted-foreground mr-3" />
                  <Input 
                    placeholder={activeView === 'friends' ? "Find friends..." : "Find vibes..."}
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
                      Friends
                    </button>
                    <button 
                      onClick={() => setActiveView('events')}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'events' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:bg-white/10'}`}
                    >
                      Events
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
            </div>
          </div>
        )}

        <div className="flex-grow" />

        {/* B. BOTTOM SHEET - Positioned above bottom navigation */}
        <div className="pointer-events-auto px-4 pb-2 z-[60] mb-20 max-h-[45vh] flex flex-col justify-end">
          
          {/* Recenter FAB */}
          {!isNavigating && !selectedFriend && !selectedEvent && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
              {(!isUnlocked && !isLaunchZone) ? (
                /* ONLY show invite card if unavailable */
                <div className="flex-shrink-0 w-full px-4 snap-center">
                  <Card className="p-8 rounded-3xl border-2 border-dashed flex flex-col items-center text-center bg-background/80 backdrop-blur-md">
                    <MapPin className="w-10 h-10 text-muted-foreground/30 mb-4" />
                    <h3 className="font-bold text-lg uppercase">{milestone?.zone_name || 'City'} is Loading</h3>
                    <p className="text-sm text-muted-foreground mb-4">We need {milestone?.target} pioneers to unlock this zone.</p>
                    <Button className="w-full rounded-2xl" onClick={() => navigate('/app/friends')}>
                       <UserPlus className="w-4 h-4 mr-2" /> Nominate this City
                    </Button>
                  </Card>
                </div>
              ) : (

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
                      <Avatar className={`w-16 h-16 border-4 border-background ${selectedFriend.is_stealth ? 'blur-md' : ''}`}>
                        <AvatarImage src={selectedFriend.avatar} />
                        <AvatarFallback>?</AvatarFallback>
                      </Avatar>
                      {selectedFriend.is_stealth && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Lock className="w-5 h-5 text-white/50" />
                        </div>
                      )}
                    </div>

                    <div><h3 className="font-bold text-xl">
                        {selectedFriend.is_stealth ? "Hidden Pioneer" : selectedFriend.name}
                      </h3>
                      {selectedFriend.is_stealth && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/20 text-primary">
                           Unlocks at {milestone?.target} members
                        </Badge>
                      )}
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

                {/* FIX: Guard against undefined friend_images with fallback to [] */}
                <div className="flex items-center justify-between mb-5 bg-muted/30 p-2.5 rounded-xl border border-border/50">
                  <div className="flex items-center -space-x-3">
                    {(selectedEvent.friend_images ?? []).length > 0 ? (
                      (selectedEvent.friend_images ?? []).map((img: string, i: number) => (
                        <Avatar key={i} className="w-8 h-8 border-2 border-background">
                          <AvatarImage src={img} />
                        </Avatar>
                      ))
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] text-muted-foreground">?</div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-background border-2 border-muted flex items-center justify-center text-[10px] font-bold z-10 shadow-sm">
                      +{selectedEvent.attendee_count}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-right">
                    <p className="text-primary">{(selectedEvent.friend_images ?? []).length} friends</p>
                    <p className="text-muted-foreground">are going</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    className="h-12 rounded-xl border-dashed border-2 border-primary/20 text-primary hover:bg-primary/5 bg-transparent"
                    onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> Vibe Chat
                  </Button>
                  <Button 
                    className="h-12 rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-white"
                    onClick={() => navigate(`/app/feed?event=${selectedEvent.id}`)}
                  >
                    <Calendar className="w-4 h-4 mr-2" /> RSVP
                  </Button>
                </div>
              </CardContent>
            </Card>
          )} 
          
          {/* 4. ADAPTIVE LIST */}
          {!isNavigating && !selectedFriend && !selectedEvent && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
              
              {/* If Low Density, show the "Global Discovery" twist first */}
              {/* LEFT BOOKEND: Global Discovery with Social Proof */}
                {showGlobalDiscovery && (
                  <div className="flex-shrink-0 snap-start">
                    <Card className="h-40 w-48 rounded-3xl border-2 border-dashed border-primary/30 bg-primary/10 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 w-12 h-12 bg-primary/10 rounded-full blur-xl" />
                      <Globe className="w-8 h-8 text-primary mb-2 animate-spin-slow" />
                      <h4 className="font-bold text-white text-sm">Quiet in {locationName || 'your area'}?</h4>
                      <p className="text-[10px] text-white mb-2 leading-tight">
                        Join communities in {locationName || 'the city'} to meet people.
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 rounded-full text-[10px] px-4 bg-background shadow-sm hover:scale-105 transition-transform" 
                        onClick={() => navigate('/app/feed?tab=communities')}
                      >
                        Explore Communities
                      </Button>
                    </Card>
                  </div>
                )}
               
                {(activeView === 'friends' ? friendsMapped : events).map((item: any) => (
                    <div
                      key={item.id}
                      className="flex-shrink-0 w-36 h-40 p-3 rounded-3xl bg-background/90 backdrop-blur-xl border border-white/10 shadow-lg cursor-pointer hover:scale-105 transition-transform snap-center flex flex-col items-center justify-center gap-2 text-center"
                      onClick={() => activeView === 'friends' ? setSelectedFriend(item) : setSelectedEvent(item)}
                    >
                      <div className="relative">
                        <Avatar className="w-14 h-14 shadow-md">
                          <AvatarImage src={item.avatar || item.image_url} className="object-cover" />
                          <AvatarFallback>{item.name?.[0] || item.title?.[0]}</AvatarFallback>
                        </Avatar>
                        {activeView === 'friends' && item.status === 'online' && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="w-full px-1">
                        <h4 className="font-bold text-sm truncate">{item.name || item.title}</h4>
                        <p className="text-[10px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                          <MapPin className="w-3 h-3" /> {item.distanceKm}km
                        </p>
                      </div>
                    </div>
                  ))} 
                  
                  {/* Invite Friends Card appended to the end of the scroll */}
                  {activeView === 'friends' && (
                    <div className="flex-shrink-0 w-48 snap-end">
                      <Button variant="outline" className="w-full h-40 rounded-3xl border-dashed border-2" onClick={() => navigate('/app/friends')}>
                        <UserPlus className="w-5 h-5" />
                        <span className="text-xs font-medium">Invite Friends</span>
                      </Button>
                    </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default MapPage;
