import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageSquare, Calendar, Users, Loader2, X, MapPinned,
  Video, Globe, Layers
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { ContactImportModal } from '@/components/map/ContactImportModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

// --- Types ---
type FriendOnMap = {
  id: string;
  name: string;
  avatar?: string;
  locationLabel: string;
  coordinates?: { lat: number; lng: number } | null;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
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

const Map = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  // --- Global State ---
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  const { friends = [] } = useFriends(user?.id);

  // --- Local State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [showContactImport, setShowContactImport] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');

  // --- 1. Fetch Friend Locations (Optimized) ---
  const friendIds = useMemo(() => {
    // FIX: Using user_id correctly as requested
    return friends.map(f => f.requester_id === user?.id ? f.addressee.user_id : f.requester.user_id);
  }, [friends, user?.id]);

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return [];
      const { data } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location, updated_at')
        .in('user_id', friendIds)
        .eq('is_sharing_location', true); 
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
    refetchInterval: 30000, 
  });

  // --- 2. Data Processing & Deduplication ---
  const nearbyFriendsRaw = useMemo(() => {
    if (!location) return [];

    const uniqueFriendsMap = new Map();

    friends.forEach(friendship => {
      const profile = friendship.requester_id === user?.id ? friendship.addressee : friendship.requester;
      // FIX: Match location by user_id
      const loc = friendLocations.find(l => l.user_id === profile.user_id);

      if (loc && loc.latitude && loc.longitude) {
        uniqueFriendsMap.set(profile.user_id, {
          user_id: profile.user_id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          profiles: {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          }
        });
      }
    });

    return Array.from(uniqueFriendsMap.values());
  }, [friends, friendLocations, location, user?.id]);

  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    
    return nearbyFriendsRaw
      .map((loc: any) => {
        const dist = distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude);
        if (dist > 50) return null; // 50km Limit

        const online = friendsPresence[loc.user_id] === 'online';
        return {
          id: loc.user_id,
          name: loc.profiles?.display_name || 'Friend',
          avatar: loc.profiles?.avatar_url,
          locationLabel: 'On the map',
          coordinates: { lat: loc.latitude, lng: loc.longitude },
          status: online ? 'online' : 'offline',
          lastSeen: online ? 'Active now' : 'Offline',
          distanceKm: Number(dist.toFixed(1)),
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
      })
      .filter(Boolean) as FriendOnMap[];
  }, [nearbyFriendsRaw, friendsPresence, location]);

  // --- 3. Events Fetching ---
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'nearby', location?.latitude, location?.longitude],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase
        .from('events')
        .select('*, creator:profiles!creator_id(display_name, avatar_url)')
        .gt('start_date', new Date().toISOString())
        .limit(50);
        
      if (!data) return [];

      return data.map((e: any) => {
        const eLat = e.latitude || 6.5244; 
        const eLng = e.longitude || 3.3792;
        const dist = distanceKm(location.latitude, location.longitude, eLat, eLng);
        
        if (dist > 50) return null;

        return {
          id: e.id,
          title: e.title,
          location: e.location,
          start_date: e.start_date,
          event_type: e.event_type,
          category: e.category,
          ticket_price: e.ticket_price,
          image_url: e.image_url,
          creator: Array.isArray(e.creator) ? e.creator[0] : e.creator,
          latitude: eLat,
          longitude: eLng,
          distanceKm: Number(dist.toFixed(1))
        };
      }).filter(Boolean);
    },
    enabled: !!location && activeView === 'events',
  });

  // --- 4. Ghost Mode ---
  useEffect(() => {
    if (!user) return;
    const checkStatus = async () => {
      const { data } = await supabase
        .from('user_locations')
        .select('is_sharing_location')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setIsGhostMode(!data.is_sharing_location);
    };
    checkStatus();
  }, [user]);

  const toggleGhostMode = async () => {
    if (!user) return;
    const newValue = !isGhostMode;
    try {
      await supabase.from('user_locations').upsert({ 
        user_id: user.id, 
        is_sharing_location: !newValue,
        updated_at: new Date().toISOString()
      });
      setIsGhostMode(newValue);
      toast.success(newValue ? "You are invisible" : "You are visible");
    } catch {
      toast.error("Failed to update status");
    }
  };

  // --- 5. Presence ---
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

  // --- Filtered Lists ---
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = activeView === 'friends' ? friendsMapped : events;
    if (!q) return list;
    return list.filter((item: any) => 
      (item.name || item.title).toLowerCase().includes(q) || 
      (item.locationLabel || item.location).toLowerCase().includes(q)
    );
  }, [searchQuery, friendsMapped, events, activeView]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {/* LAYER 1: MAP */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <LeafletMap
          ref={mapRef}
          userLocation={location}
          friendsLocations={activeView === 'friends' ? nearbyFriendsRaw : []} 
          loading={locationLoading}
          error={locationError}
          mapStyle={mapStyle} 
        />
      </div>

      {/* LAYER 2: UI OVERLAY */}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
        
        {/* Header */}
        <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
          <div className="container-mobile flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <Input 
                placeholder={activeView === 'friends' ? "Find friends..." : "Find events..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/60 backdrop-blur-md"
              />
            </div>
            
            <Button 
              size="icon" 
              variant={isGhostMode ? "destructive" : "secondary"}
              className="rounded-full shadow-lg backdrop-blur-md bg-white/20 border-white/20 text-white"
              onClick={toggleGhostMode}
            >
              {isGhostMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>

            <Button 
              size="icon" 
              variant="secondary" 
              className="rounded-full shadow-lg backdrop-blur-md bg-white/20 border-white/20 text-white"
              onClick={() => setShowContactImport(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="container-mobile mt-3 flex justify-between items-center">
            <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)} className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2 bg-white/10 backdrop-blur-md border border-white/10">
                <TabsTrigger value="friends" className="text-white data-[state=active]:bg-white/20">Friends</TabsTrigger>
                <TabsTrigger value="events" className="text-white data-[state=active]:bg-white/20">Events</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20 gap-2 backdrop-blur-md bg-white/5 rounded-full px-3"
              onClick={() => setMapStyle(prev => prev === 'standard' ? 'satellite' : 'standard')}
            >
              {mapStyle === 'standard' ? <Globe className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              <span className="text-xs">{mapStyle === 'standard' ? 'Satellite' : 'Standard'}</span>
            </Button>
          </div>
        </div>

        <div className="flex-grow" />

        {/* BOTTOM SHEET */}
        <div className="relative pointer-events-auto pb-safe">
          <div className="container-mobile flex justify-end mb-4 px-4">
            <Button
              onClick={() => location ? mapRef.current?.recenter() : requestLocation()}
              className="rounded-full shadow-lg h-12 w-12 bg-white text-black hover:bg-gray-100"
            >
              {locationLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Crosshair className="h-6 w-6" />}
            </Button>
          </div>

          <div className="max-h-[45vh] overflow-y-auto px-4 pb-6">
            {/* Conditional Rendering */}
            {selectedFriend && activeView === 'friends' ? (
                <Card className="gradient-card shadow-card border-0 animate-in slide-in-from-bottom-10 backdrop-blur-xl bg-background/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-14 h-14 border-2 border-white/20">
                            <AvatarImage src={selectedFriend.avatar || undefined} />
                            <AvatarFallback>{selectedFriend.name.slice(0,2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {selectedFriend.status === 'online' && (
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{selectedFriend.name}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> 
                            {selectedFriend.locationLabel}
                            {selectedFriend.distanceKm && ` • ${selectedFriend.distanceKm}km away`}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedFriend(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        className="gradient-primary text-white"
                        onClick={() => navigate(`/messages?userId=${selectedFriend.id}`)}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Message
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const { latitude, longitude } = selectedFriend;
                          if (latitude && longitude) {
                            const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
                            window.open(url, '_blank');
                          } else {
                            toast.error('Location unavailable');
                          }
                        }}
                        disabled={!selectedFriend.latitude || !selectedFriend.longitude}
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Directions
                      </Button>
                    </div>
                  </CardContent>
                </Card>
            ) : selectedEvent && activeView === 'events' ? (
                <Card className="gradient-card shadow-card border-0 animate-in slide-in-from-bottom-10 backdrop-blur-xl bg-background/90">
                  <CardContent className="p-4">
                    <div className="flex gap-3 mb-4">
                      {selectedEvent.image_url && (
                        <img 
                          src={selectedEvent.image_url} 
                          alt={selectedEvent.title}
                          className="w-20 h-20 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h3 className="font-bold text-lg leading-tight">{selectedEvent.title}</h3>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedEvent(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(selectedEvent.start_date), 'MMM d, h:mm a')}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {selectedEvent.location}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        className="gradient-primary text-white"
                        // FIX: Updated route to /events/...
                        onClick={() => navigate(`/events/${selectedEvent.id}`)}
                      >
                        View Details
                      </Button>
                      {selectedEvent.latitude && selectedEvent.longitude && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedEvent.latitude},${selectedEvent.longitude}`;
                            window.open(url, '_blank');
                          }}
                        >
                          <Navigation className="w-4 h-4 mr-2" />
                          Directions
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
            ) : (
                <Card className="gradient-card shadow-card border-0 backdrop-blur-xl bg-background/85">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{activeView === 'friends' ? 'Nearby Friends' : 'Nearby Events'}</h3>
                      <Badge variant="secondary" className="text-xs">{filteredList.length}</Badge>
                    </div>

                    <div className="space-y-1">
                      {filteredList.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                          {searchQuery ? `No ${activeView} match your search.` : `No ${activeView} found nearby.`}
                        </div>
                      ) : (
                        filteredList.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => activeView === 'friends' ? setSelectedFriend(item) : setSelectedEvent(item)}
                          >
                            {activeView === 'friends' ? (
                              <div className="relative">
                                <Avatar className="w-10 h-10">
                                  <AvatarImage src={item.avatar} />
                                  <AvatarFallback>{item.name[0]}</AvatarFallback>
                                </Avatar>
                                {item.status === 'online' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {format(new Date(item.start_date), 'd')}
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between">
                                <h4 className="font-medium text-sm truncate">{item.name || item.title}</h4>
                                <span className="text-xs text-muted-foreground">{item.distanceKm}km</span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{item.locationLabel || item.location}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
            )}
          </div>
        </div>
      </div>

      <ContactImportModal open={showContactImport} onOpenChange={setShowContactImport} />
    </div>
  );
};

export default Map;
