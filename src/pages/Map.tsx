import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Users, Loader2, X, 
  Globe, Layers, Radar, CornerUpRight, Sparkles, UserPlus, Rocket,
  ShieldCheck, Flame // Added for Dual-Faced UX
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
  user_type?: 'personal' | 'vendor'; // Dual-faced logic
  verification_status?: string;
  profiles?: { display_name?: string | null; avatar_url?: string | null } | null;
};

// --- Helpers (RESTORED) ---
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
  const mapRef = useRef<LeafletMapHandle>(null);
  
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading, currentCount, targetCount } = useLaunchZone(location?.latitude, location?.longitude);
  const { friends = [] } = useFriends(user?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('satellite');
  
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // --- 1. Real-time Status Indicators ---
  useEffect(() => {
    if (!user) return;
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

  // --- 2. Data Fetching (RESTORED ORIGINAL LOGIC) ---
  const friendIds = useMemo(() => {
    if (!user || !friends) return [];
    return friends.map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id).filter(Boolean);
  }, [friends, user]);

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return [];
      const { data } = await supabase.from('user_locations').select('*').in('user_id', friendIds);
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events-map', location?.latitude],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('events').select('*, profiles:creator_id(user_type, verification_status)');
      return data?.map((e: any) => ({
        ...e,
        distanceKm: Number(distanceKm(location.latitude, location.longitude, e.latitude || 0, e.longitude || 0).toFixed(1)),
        is_vibe: (e.attendee_count || 0) > 10 // Vibe Pulse logic
      })) || [];
    },
    enabled: !!location && activeView === 'events'
  });

  // --- 3. Map Mapping (RESTORED PROXIMITY SORT) ---
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    return friendLocations.map(loc => {
      const f = friends.find((f: any) => f.requester_id === loc.user_id || f.addressee_id === loc.user_id);
      const isReq = f?.requester_id === loc.user_id;
      const prof = isReq ? f?.requester : f?.addressee;
      return {
        id: loc.user_id,
        user_id: loc.user_id,
        name: prof?.display_name || 'Friend',
        avatar: prof?.avatar_url,
        coordinates: { lat: loc.latitude, lng: loc.longitude },
        status: friendsPresence[loc.user_id] === 'online' ? 'online' : 'offline',
        lastSeen: friendsPresence[loc.user_id] === 'online' ? 'Active now' : 'Seen recently',
        distanceKm: Number(distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude).toFixed(1)),
        user_type: prof?.user_type || 'personal',
        verification_status: prof?.verification_status
      };
    }).sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  }, [friendLocations, friends, location, friendsPresence]);

  // --- Navigation Logic (RESTORED) ---
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
        setRouteCoordinates(data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]));
      }
    } catch { toast.error("Routing failed"); } finally { setIsRouting(false); }
  };

  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = activeView === 'friends' ? friendsMapped : events;
    return q ? list.filter((item: any) => (item.name || item.title).toLowerCase().includes(q)) : list;
  }, [searchQuery, friendsMapped, events, activeView]);

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={!!launchCityName}
      isInLaunchZone={isInLaunchZone}
      cityName={launchCityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0}
    >
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        <div className="absolute inset-0 z-0 h-full w-full">
          <LeafletMap
            ref={mapRef}
            userLocation={location}
            friendsLocations={activeView === 'friends' ? friendsMapped : []}
            eventLocations={activeView === 'events' ? events : []} // ACTUALLY SHOWING EVENTS
            mapStyle={mapStyle} 
            routeCoordinates={routeCoordinates}
          />
        </div>
        
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <div className="pt-safe-top px-4 mt-4 pointer-events-auto">
            <div className="flex flex-col gap-3 max-w-md mx-auto">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 h-12 bg-background/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg flex items-center px-4">
                  <Search className="w-5 h-5 text-muted-foreground mr-3" />
                  <Input 
                    placeholder={activeView === 'friends' ? "Friend Radar..." : "Marketplace Scan..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-0 h-full focus-visible:ring-0 p-0 text-base"
                  />
                </div>
                <Button size="icon" className={`h-12 w-12 rounded-2xl shadow-lg ${isGhostMode ? "bg-purple-600" : "bg-background/80 backdrop-blur-xl"}`} onClick={() => setIsGhostMode(!isGhostMode)}>
                   {isGhostMode ? <EyeOff className="w-5 h-5" /> : <Radar className="w-5 h-5 text-primary" />}
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <div className="bg-background/80 backdrop-blur-xl border border-white/10 rounded-full p-1 flex shadow-lg">
                  <button onClick={() => setActiveView('friends')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'friends' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>Hanging Out</button>
                  <button onClick={() => setActiveView('events')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'events' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>Marketplace</button>
                </div>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-background/60 backdrop-blur-md shadow-sm border border-white/10" onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}>
                  {mapStyle === 'standard' ? <Globe className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-grow" />

          {/* LAYER 2: FLOATING ISLANDS (RESTORED ORIGINAL LAYOUT) */}
          <div className="pointer-events-auto px-4 pb-2 z-[60] mb-20 flex flex-col justify-end">
            
            {/* Recenter FAB (Original Location) */}
            {!selectedFriend && !selectedEvent && !isNavigating && (
              <div className="flex justify-end mb-4">
                <Button onClick={() => mapRef.current?.recenter()} className="rounded-full h-12 w-12 shadow-xl bg-background/90 text-primary border border-white/20">
                  <Crosshair className="h-6 w-6" />
                </Button>
              </div>
            )}

            {/* Friend Card (Restored MEET button) */}
            {!isNavigating && selectedFriend && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar className="w-16 h-16 border-4 border-background">
                          <AvatarImage src={selectedFriend.avatar} />
                          <AvatarFallback>{selectedFriend.name[0]}</AvatarFallback>
                        </Avatar>
                        {selectedFriend.status === 'online' && (
                          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-xl flex items-center gap-1">
                          {selectedFriend.name}
                          {selectedFriend.verification_status === 'verified' && <ShieldCheck className="w-4 h-4 text-primary" />}
                        </h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {selectedFriend.distanceKm}km away • {selectedFriend.lastSeen}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedFriend(null)}><X className="w-5 h-5" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className="h-12 rounded-xl bg-primary/10 text-primary hover:bg-primary/20" onClick={() => navigate(`/app/messages?id=${selectedFriend.id}`)}>
                      <MessageCircle className="w-5 h-5 mr-2" /> Message
                    </Button>
                    <Button className="h-12 rounded-xl bg-primary text-white" onClick={() => handleGetDirections(selectedFriend.coordinates!.lat, selectedFriend.coordinates!.lng, selectedFriend.name)}>
                      <Navigation className="w-5 h-5 mr-2" /> Meet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Event Card (RESTORED LAYOUT + VIBE PULSE) */}
            {!isNavigating && selectedEvent && (
              <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur-xl rounded-3xl animate-in slide-in-from-bottom-10 overflow-hidden">
                <div className="relative h-32 w-full">
                  <img src={selectedEvent.image_url} className="w-full h-full object-cover" />
                  {selectedEvent.is_vibe && <div className="absolute top-2 left-2"><Badge className="bg-orange-500 animate-pulse border-0 shadow-lg"><Flame className="w-3 h-3 mr-1" /> HIGH VIBE</Badge></div>}
                  <Button variant="secondary" size="icon" className="absolute top-2 right-2 rounded-full h-8 w-8" onClick={() => setSelectedEvent(null)}><X className="w-4 h-4" /></Button>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-bold text-xl">{selectedEvent.title}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1 truncate"><MapPin className="w-3 h-3" /> {selectedEvent.location}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}><Sparkles className="w-4 h-4 mr-2" /> Vibe Chat</Button>
                    <Button className="h-11 rounded-xl gradient-primary text-white" onClick={() => navigate(`/app/feed?event=${selectedEvent.id}`)}>RSVP</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* DEFAULT HORIZONTAL ISLANDS (RESTORED PROXIMITY PRIORITY) */}
            {!selectedFriend && !selectedEvent && !isNavigating && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
                {filteredList.map((item: any) => (
                  <div key={item.id} onClick={() => activeView === 'friends' ? setSelectedFriend(item) : setSelectedEvent(item)} className="flex-shrink-0 w-36 h-40 p-3 rounded-3xl bg-background/90 backdrop-blur-xl border border-white/10 shadow-lg cursor-pointer snap-start flex flex-col items-center justify-center gap-2 text-center transition-transform active:scale-95">
                    <div className="relative">
                      <Avatar className={`w-14 h-14 ${item.is_vibe ? 'ring-2 ring-orange-500 ring-offset-2 animate-pulse' : ''}`}>
                        <AvatarImage src={item.avatar || item.image_url} className="object-cover" />
                        <AvatarFallback>{item.name?.[0] || item.title?.[0]}</AvatarFallback>
                      </Avatar>
                      {activeView === 'friends' && item.status === 'online' && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="w-full px-1">
                      <h4 className="font-bold text-xs truncate">{item.name || item.title}</h4>
                      <p className="text-[10px] text-primary font-bold">{item.distanceKm}km away</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </LaunchZoneGuard>
  );
};

export default MapPage;
