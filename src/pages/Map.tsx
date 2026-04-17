import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageCircle, Calendar, Users, Loader2, X, 
  Globe, Layers, Radar, CornerUpRight, Sparkles, UserPlus, Rocket,
  ShieldCheck, Flame, Info
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';

// --- CRITICAL HELPERS (Restored) ---
const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

type FriendOnMap = {
  id: string;
  user_id: string;
  name: string;
  avatar?: string;
  coordinates?: { lat: number; lng: number } | null;
  status: 'online' | 'offline';
  lastSeen?: string;
  distanceKm: number;
  user_type: 'personal' | 'vendor';
  verification_status?: string;
};

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  const { location, isLoading: locationLoading } = useGeolocation();
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading, currentCount, targetCount } = useLaunchZone(location?.latitude, location?.longitude);
  const { friends = [] } = useFriends(user?.id);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});

  // --- 1. Realtime Presence (Friend Radar) ---
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('online-users', { config: { presence: { key: user.id } } });
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineMap: Record<string, 'online' | 'offline'> = {};
        Object.keys(state).forEach(id => { onlineMap[id] = 'online'; });
        setFriendsPresence(onlineMap);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // --- 2. Data Fetching (Marketplace & Hanging Out) ---
  const friendIds = useMemo(() => 
    friends.map((f: any) => f.requester_id === user?.id ? f.addressee_id : f.requester_id).filter(Boolean),
  [friends, user]);

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      const { data } = await supabase.from('user_locations').select('*').in('user_id', friendIds).eq('is_sharing_location', true);
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events-map', location?.latitude],
    queryFn: async () => {
      const { data } = await supabase.from('events').select('*, profiles:creator_id(user_type, verification_status)');
      return data?.map((e: any) => ({
        ...e,
        distance: location ? distanceKm(location.latitude, location.longitude, e.latitude || 0, e.longitude || 0) : 0,
        is_vibe: (e.attendee_count || 0) > 10
      })) || [];
    },
    enabled: !!location && activeView === 'events',
  });

  // --- 3. Proximity Priority Mapping ---
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    return friendLocations.map(loc => {
      const f = friends.find((f: any) => f.requester_id === loc.user_id || f.addressee_id === loc.user_id);
      const prof = f?.requester_id === loc.user_id ? f?.requester : f?.addressee;
      return {
        id: loc.user_id,
        user_id: loc.user_id,
        name: prof?.display_name || 'User',
        avatar: prof?.avatar_url,
        coordinates: { lat: loc.latitude, lng: loc.longitude },
        status: friendsPresence[loc.user_id] || 'offline',
        distanceKm: distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude),
        user_type: prof?.user_type || 'personal',
        verification_status: prof?.verification_status
      };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }, [friendLocations, friends, location, friendsPresence]);

  const filteredEvents = useMemo(() => 
    events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0)),
  [events, searchQuery]);

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
      <div className="relative h-screen w-screen bg-background overflow-hidden">
        {/* THE MAP LAYER */}
        <div className="absolute inset-0 z-0">
          <LeafletMap 
            ref={mapRef} 
            userLocation={location} 
            friendsLocations={activeView === 'friends' ? friendsMapped : []}
            eventLocations={activeView === 'events' ? filteredEvents : []}
          />
        </div>

        {/* TOP OVERLAY: Search & Toggles */}
        <div className="absolute top-0 left-0 w-full z-20 p-4 pt-12 pointer-events-none">
          <div className="max-w-md mx-auto space-y-3 pointer-events-auto">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder={activeView === 'friends' ? "Friend Radar..." : "Find Vibes..."}
                  className="pl-10 h-12 bg-background/80 backdrop-blur-xl border-white/20 rounded-2xl shadow-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button 
                variant="secondary" 
                className={`h-12 w-12 rounded-2xl shadow-xl bg-background/80 backdrop-blur-xl ${isGhostMode ? 'text-purple-500' : ''}`}
                onClick={() => setIsGhostMode(!isGhostMode)}
              >
                {isGhostMode ? <EyeOff className="w-5 h-5" /> : <Radar className="w-5 h-5" />}
              </Button>
            </div>

            <div className="flex justify-center">
              <div className="inline-flex bg-background/80 backdrop-blur-xl p-1 rounded-full border border-white/10 shadow-lg">
                <button onClick={() => setActiveView('friends')} className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'friends' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>Hanging Out</button>
                <button onClick={() => setActiveView('events')} className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${activeView === 'events' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>Marketplace</button>
              </div>
            </div>
          </div>
        </div>

        {/* RECENTER BUTTON (Restored) */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
           <Button 
             size="icon" 
             className="h-12 w-12 rounded-full shadow-2xl bg-primary text-white"
             onClick={() => mapRef.current?.recenter()}
           >
             <Crosshair className="w-5 h-5" />
           </Button>
        </div>

        {/* BOTTOM OVERLAY: The Floating Islands (Restored) */}
        <div className="absolute bottom-24 left-0 w-full z-30 pointer-events-none">
          <div className="flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-hide snap-x pointer-events-auto">
            {activeView === 'friends' ? (
              friendsMapped.map(f => (
                <div key={f.id} onClick={() => setSelectedFriend(f)} className="flex-shrink-0 w-40 snap-start">
                  <Card className={`border-0 shadow-2xl bg-background/90 backdrop-blur-xl rounded-3xl transition-transform ${selectedFriend?.id === f.id ? 'scale-105 border-2 border-primary' : 'hover:scale-105'}`}>
                    <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                      <div className="relative">
                        <Avatar className="h-16 w-16 border-2 border-background">
                          <AvatarImage src={f.avatar} />
                          <AvatarFallback>{f.name[0]}</AvatarFallback>
                        </Avatar>
                        {f.status === 'online' && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />}
                      </div>
                      <div>
                        <p className="font-bold text-sm truncate w-full">{f.name}</p>
                        <p className="text-[10px] text-primary font-bold">{f.distanceKm.toFixed(1)}km away</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))
            ) : (
              filteredEvents.map(e => (
                <div key={e.id} onClick={() => setSelectedEvent(e)} className="flex-shrink-0 w-48 snap-start">
                  <Card className={`border-0 shadow-2xl bg-background/90 backdrop-blur-xl rounded-3xl overflow-hidden transition-transform ${selectedEvent?.id === e.id ? 'scale-105 border-2 border-primary' : 'hover:scale-105'}`}>
                    <div className="h-24 w-full relative">
                      <img src={e.image_url} className="w-full h-full object-cover" />
                      {e.is_vibe && <div className="absolute top-2 left-2"><Badge className="bg-orange-500 text-white animate-pulse border-0"><Flame className="w-3 h-3 mr-1" /> VIBE</Badge></div>}
                    </div>
                    <CardContent className="p-3">
                      <p className="font-bold text-xs truncate">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{e.location}</p>
                    </CardContent>
                  </Card>
                </div>
              ))
            )}
          </div>
        </div>

        {/* DETAIL MODALS (For lively interactions) */}
        {selectedFriend && (
          <div className="absolute inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-end p-4 pb-28" onClick={() => setSelectedFriend(null)}>
             <Card className="w-full max-w-md mx-auto rounded-3xl shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-20 w-20 border-4 border-primary/10">
                      <AvatarImage src={selectedFriend.avatar} />
                      <AvatarFallback>{selectedFriend.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        {selectedFriend.name}
                        {selectedFriend.verification_status === 'verified' && <ShieldCheck className="w-5 h-5 text-primary" />}
                      </h3>
                      <p className="text-sm text-muted-foreground">@{selectedFriend.status} • {selectedFriend.distanceKm.toFixed(1)}km away</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-12 rounded-2xl" onClick={() => navigate(`/app/messages?id=${selectedFriend.id}`)}><MessageCircle className="w-4 h-4 mr-2" /> Chat</Button>
                    <Button className="h-12 rounded-2xl gradient-primary text-white" onClick={() => mapRef.current?.recenter()}><Navigation className="w-4 h-4 mr-2" /> Recenter</Button>
                  </div>
                </CardContent>
             </Card>
          </div>
        )}
      </div>
    </LaunchZoneGuard>
  );
};

export default MapPage;
