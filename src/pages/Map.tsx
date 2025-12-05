import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, 
  MapPin, 
  Search, 
  Plus,
  Eye, 
  EyeOff, 
  Navigation,
  MessageSquare,
  Calendar,
  Users,
  Loader2,
  X,
  MapPinned,
  Video
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { ContactImportModal } from '@/components/map/ContactImportModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { format } from 'date-fns';

// --- Types ---
type UserProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
};

type UserLocationRow = {
  user_id: string;
  latitude: string | number | null;
  longitude: string | number | null;
  is_sharing_location?: boolean | null;
  profiles?: UserProfile | null;
};

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

type EventOnMap = {
  id: string;
  title: string;
  location: string;
  start_date: string;
  event_type: 'physical' | 'virtual';
  category: string;
  ticket_price: number;
  image_url?: string;
  attendee_count?: number;
  creator?: {
    display_name: string;
    avatar_url?: string;
  };
  latitude?: number | null;
  longitude?: number | null;
};

// --- Helpers ---
const toNumber = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; 
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Geocode location string to coordinates (mock - in production use Google Maps API)
const geocodeLocation = async (location: string): Promise<{ lat: number; lng: number } | null> => {
  // This is a placeholder. In production, you'd use:
  // - Google Maps Geocoding API
  // - Mapbox Geocoding API
  // - OpenStreetMap Nominatim
  
  // For now, return null for simplicity
  // You can add a lookup table for common locations in your area
  const locationMap: Record<string, { lat: number; lng: number }> = {
    'lagos': { lat: 6.5244, lng: 3.3792 },
    'victoria island': { lat: 6.4281, lng: 3.4219 },
    'lekki': { lat: 6.4474, lng: 3.4726 },
    'ikeja': { lat: 6.5964, lng: 3.3425 },
    'yaba': { lat: 6.5074, lng: 3.3722 },
  };

  const normalized = location.toLowerCase().trim();
  for (const [key, coords] of Object.entries(locationMap)) {
    if (normalized.includes(key)) {
      return coords;
    }
  }

  return null;
};

const Map = () => {
  // --- State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsLocations, setFriendsLocations] = useState<any[]>([]);
  const [friendsPresence, setFriendsPresence] = useState<Record<string, 'online' | 'offline'>>({});
  const [showContactImport, setShowContactImport] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendOnMap | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventOnMap | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [activeView, setActiveView] = useState<'friends' | 'events'>('friends');
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  
  const { user } = useAuth();
  const { location, error: locationError, loading: locationLoading } = useGeolocation();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);

  // --- Fetch Nearby Events ---
  const { data: nearbyEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['events', 'nearby', location?.latitude, location?.longitude],
    queryFn: async (): Promise<EventOnMap[]> => {
      if (!location?.latitude || !location?.longitude) return [];

      // Get public upcoming events
      const { data: events, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          location,
          start_date,
          event_type,
          category,
          ticket_price,
          image_url,
          creator:profiles!creator_id(display_name, avatar_url)
        `)
        .eq('is_public', true)
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(50);

      if (error) throw error;
      if (!events) return [];

      // Geocode event locations and calculate distances
      const eventsWithLocations = await Promise.all(
        events.map(async (event: any) => {
          // Try to geocode the location
          const coords = await geocodeLocation(event.location);
          
          // Get attendee count
          const { count } = await supabase
            .from('event_attendees')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('status', 'confirmed');

          const creatorData = Array.isArray(event.creator) ? event.creator[0] : event.creator;

          return {
            id: event.id,
            title: event.title,
            location: event.location,
            start_date: event.start_date,
            event_type: (event.event_type as 'physical' | 'virtual') || 'physical',
            category: event.category,
            ticket_price: event.ticket_price,
            image_url: event.image_url,
            creator: creatorData,
            latitude: coords?.lat || null,
            longitude: coords?.lng || null,
            attendee_count: count || 0,
          };
        })
      );

      // Filter to only events within 20km (if they have coordinates)
      const nearbyOnly = eventsWithLocations.filter((event) => {
        if (!event.latitude || !event.longitude) return true; // Include all events without coords
        const distance = distanceKm(
          location.latitude,
          location.longitude,
          event.latitude,
          event.longitude
        );
        return distance <= 20; // 20km radius
      });

      return nearbyOnly;
    },
    enabled: !!location?.latitude && !!location?.longitude && activeView === 'events',
    staleTime: 60000,
  });

  const handleRecenter = () => {
    mapRef.current?.recenter();
  };

  // --- 1. Fetch Friends Logic ---
  const fetchFriendsLocations = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    try {
      const { data: friendships, error: friendshipsError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (friendshipsError) throw friendshipsError;

      const friendIds = (friendships || []).map((f: any) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      if (!friendIds.length) {
        setFriendsLocations([]);
        return;
      }

      const { data: locations, error: locationsError } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location, updated_at')
        .in('user_id', friendIds)
        .eq('is_sharing_location', true);

      if (locationsError) throw locationsError;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', friendIds);

      const locationsWithProfiles = (locations || []).map((loc) => {
        const profile = profiles?.find((p) => p.user_id === loc.user_id);
        return {
          ...loc,
          profiles: profile ? { display_name: profile.display_name, avatar_url: profile.avatar_url } : null,
        };
      });

      if (!signal?.aborted) setFriendsLocations(locationsWithProfiles);
    } catch (err) {
      console.error('fetchFriendsLocations error', err);
    }
  }, [user]);

  // --- 2. Update My Location ---
  const updateMyLocation = useCallback(async () => {
    if (!user || !location || isGhostMode || isUpdatingLocation) return;

    setIsUpdatingLocation(true);
    try {
      const { error } = await supabase
        .from('user_locations')
        .upsert({
          user_id: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
          is_sharing_location: true,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update location:', error);
    } finally {
      setIsUpdatingLocation(false);
    }
  }, [user, location, isGhostMode, isUpdatingLocation]);

  // Update location every 30 seconds
  useEffect(() => {
    if (!isGhostMode && location) {
      updateMyLocation();
      const interval = setInterval(updateMyLocation, 30000);
      return () => clearInterval(interval);
    }
  }, [isGhostMode, location, updateMyLocation]);

  // --- 3. Toggle Ghost Mode ---
  const toggleGhostMode = async () => {
    if (!user) return;
    const newValue = !isGhostMode;

    try {
      const { error } = await supabase
        .from('user_locations')
        .upsert({ 
          user_id: user.id, 
          is_sharing_location: !newValue,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      
      setIsGhostMode(newValue);
      toast.success(newValue ? "You are now invisible" : "You are visible on the map");
    } catch (error) {
      toast.error("Failed to update location settings");
    }
  };

  // --- 4. Initial Load & Realtime ---
  useEffect(() => {
    if (!user) return;

    const checkMyStatus = async () => {
      const { data } = await supabase
        .from('user_locations')
        .select('is_sharing_location')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setIsGhostMode(!data.is_sharing_location);
      }
    };
    checkMyStatus();

    const controller = new AbortController();
    fetchFriendsLocations(controller.signal);

    let channel: any = null;
    (async () => {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');
        
      const friendIds = (friendships || []).map((f: any) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      channel = supabase
        .channel('public:user_locations')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'user_locations' 
        }, (payload: any) => {
          const userId = payload.new?.user_id || payload.old?.user_id;
          if (userId && friendIds.includes(userId)) {
            fetchFriendsLocations();
          }
        })
        .subscribe();
    })();

    return () => {
      controller.abort();
      if (channel?.unsubscribe) channel.unsubscribe();
    };
  }, [user, fetchFriendsLocations]);

  // --- 5. Presence ---
  useEffect(() => {
    if (!user) return;
    const presenceChannel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const newPresence: Record<string, 'online' | 'offline'> = {};
        
        for (const userId in state) {
          if (state[userId] && state[userId].length > 0) {
            newPresence[userId] = 'online';
          }
        }
        
        setFriendsPresence(newPresence);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: user.id, online: true });
        }
      });

    return () => {
      presenceChannel.unsubscribe();
    };
  }, [user]);

  // --- 6. Data Processing (with deduplication) ---
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    const seen = new Set<string>();
    return friendsLocations
      .filter((loc) => {
        if (seen.has(loc.user_id)) return false;
        seen.add(loc.user_id);
        return true;
      })
      .map((loc) => {
        const lat = toNumber(loc.latitude);
        const lng = toNumber(loc.longitude);
        const name = loc.profiles?.display_name || 'Friend';
        const avatar = loc.profiles?.avatar_url || undefined;
        const coords = lat !== null && lng !== null ? { lat, lng } : null;
        const online = friendsPresence[loc.user_id] === 'online';

        return {
          id: String(loc.user_id),
          name,
          avatar,
          locationLabel: coords ? 'On the map' : 'Location hidden',
          coordinates: coords,
          status: online ? 'online' : 'offline',
          lastSeen: online ? 'Active now' : 'Offline',
          distanceKm: null,
          latitude: lat,
          longitude: lng,
        };
      });
  }, [friendsLocations, friendsPresence]);

  const friendsWithDistance = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return friendsMapped;
    const { latitude: userLat, longitude: userLng } = location;
    return friendsMapped.map((f) => {
      if (f.latitude == null || f.longitude == null) return { ...f, distanceKm: null };
      const km = distanceKm(userLat, userLng, f.latitude, f.longitude);
      return { ...f, distanceKm: Number(km.toFixed(2)) };
    });
  }, [friendsMapped, location]);

  const eventsWithDistance = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return nearbyEvents;
    const { latitude: userLat, longitude: userLng } = location;
    return nearbyEvents.map((e) => {
      if (e.latitude == null || e.longitude == null) return e;
      const km = distanceKm(userLat, userLng, e.latitude, e.longitude);
      return { ...e, distanceKm: Number(km.toFixed(2)) };
    });
  }, [nearbyEvents, location]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friendsWithDistance;
    return friendsWithDistance.filter((f) => {
      const nameMatch = f.name.toLowerCase().includes(q);
      const locMatch = (f.locationLabel || '').toLowerCase().includes(q);
      return nameMatch || locMatch;
    });
  }, [friendsWithDistance, searchQuery]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eventsWithDistance;
    return eventsWithDistance.filter((e) => {
      const titleMatch = e.title.toLowerCase().includes(q);
      const locationMatch = e.location.toLowerCase().includes(q);
      const categoryMatch = e.category.toLowerCase().includes(q);
      return titleMatch || locationMatch || categoryMatch;
    });
  }, [eventsWithDistance, searchQuery]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      
      {/* --- LAYER 1: MAP --- */}
      <div className="absolute inset-0 z-0">
        <LeafletMap
          ref={mapRef}
          userLocation={location ?? { latitude: 6.5244, longitude: 3.3792 }}
          friendsLocations={activeView === 'friends' ? friendsLocations : []}
          loading={locationLoading}
          error={locationError}
        />
      </div>

      {/* --- LAYER 2: UI OVERLAY --- */}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
        
        {/* HEADER */}
        <div className="bg-gradient-to-b from-black/60 to-transparent p-4 pointer-events-auto">
          <div className="container-mobile flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <Input 
                placeholder={activeView === 'friends' ? "Find friends..." : "Find events..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/20 border-white/30 text-white placeholder:text-white/70 backdrop-blur-md"
              />
            </div>
            
            {/* Ghost Mode Toggle */}
            <Button 
              size="icon" 
              variant={isGhostMode ? "destructive" : "secondary"}
              className={`rounded-full shadow-lg transition-all ${
                isGhostMode 
                  ? 'opacity-100' 
                  : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
              }`}
              onClick={toggleGhostMode}
              title={isGhostMode ? "You are hidden" : "You are visible"}
            >
              {isGhostMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>

            {/* Add Friend */}
            <Button 
              size="icon" 
              variant="secondary" 
              className="bg-white/20 text-white border-white/30 hover:bg-white/30 rounded-full backdrop-blur-md"
              onClick={() => setShowContactImport(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* View Toggle */}
          <div className="container-mobile mt-3">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'friends' | 'events')}>
              <TabsList className="grid w-full grid-cols-2 bg-white/20 backdrop-blur-md">
                <TabsTrigger value="friends" className="text-white data-[state=active]:bg-white data-[state=active]:text-foreground">
                  <Users className="w-4 h-4 mr-2" />
                  Friends
                </TabsTrigger>
                <TabsTrigger value="events" className="text-white data-[state=active]:bg-white data-[state=active]:text-foreground">
                  <Calendar className="w-4 h-4 mr-2" />
                  Events
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex-grow" />

        {/* BOTTOM SHEET */}
        <div className="relative pointer-events-auto pb-6">
          {location && (
            <div className="container-mobile flex justify-end mb-4">
              <Button
                onClick={handleRecenter}
                className="rounded-full shadow-lg h-12 w-12 bg-background text-foreground hover:bg-muted"
                title="Recenter"
              >
                <Crosshair className="h-6 w-6" />
              </Button>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto">
            <div className="container-mobile space-y-4">
              
              {/* Selected Friend Card */}
              {selectedFriend && activeView === 'friends' && (
                <Card className="gradient-card shadow-card border-0 animate-in slide-in-from-bottom-10">
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
              )}

              {/* Selected Event Card */}
              {selectedEvent && activeView === 'events' && (
                <Card className="gradient-card shadow-card border-0 animate-in slide-in-from-bottom-10">
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
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {selectedEvent.category}
                            </Badge>
                            {selectedEvent.event_type === 'virtual' ? (
                              <Badge className="text-xs"><Video className="w-3 h-3 mr-1" /> Virtual</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs"><MapPinned className="w-3 h-3 mr-1" /> Physical</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        className="gradient-primary text-white"
                        onClick={() => navigate(`/app/events/${selectedEvent.id}`)}
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
              )}

              {/* Friends/Events List */}
              {!selectedFriend && !selectedEvent && (
                <Card className="gradient-card shadow-card border-0 backdrop-blur-md bg-background/80">
                  <CardContent className="p-4">
                    {activeView === 'friends' ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold">Nearby friends</h3>
                          <Badge variant="secondary" className="text-xs">
                            {filteredFriends.length}
                          </Badge>
                        </div>

                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {filteredFriends.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              {searchQuery ? "No friends found." : "No friends are sharing location."}
                            </div>
                          ) : (
                            filteredFriends.map((friend) => (
                              <div
                                key={friend.id}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                                onClick={() => setSelectedFriend(friend)}
                              >
                                <div className="relative">
                                  <Avatar className="w-10 h-10">
                                    <AvatarImage src={friend.avatar || undefined} />
                                    <AvatarFallback>{friend.name.slice(0,2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  {friend.status === 'online' && (
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                                  )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center">
                                    <h4 className="font-medium text-sm truncate">{friend.name}</h4>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {friend.distanceKm ? `${friend.distanceKm}km` : ''}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {friend.locationLabel}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold">Nearby events</h3>
                          <Badge variant="secondary" className="text-xs">
                            {filteredEvents.length}
                          </Badge>
                        </div>

                        {loadingEvents ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {filteredEvents.length === 0 ? (
                              <div className="text-center py-4 text-muted-foreground text-sm">
                                {searchQuery ? "No events found." : "No upcoming events nearby."}
                              </div>
                            ) : (
                              filteredEvents.map((event) => (
                                <div
                                  key={event.id}
                                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                                  onClick={() => setSelectedEvent(event)}
                                >
                                  {event.image_url ? (
                                    <img 
                                      src={event.image_url} 
                                      alt={event.title}
                                      className="w-12 h-12 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-xs">
                                      {format(new Date(event.start_date), 'MMM d')}
                                    </div>
                                  )}
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                      <h4 className="font-medium text-sm truncate">{event.title}</h4>
                                      {event.ticket_price > 0 ? (
                                        <Badge className="bg-green-100 text-green-700 text-[10px] shrink-0">
                                          ₦{event.ticket_price}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] shrink-0">Free</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1 truncate">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        {event.location}
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <Users className="w-3 h-3 shrink-0" />
                                        {event.attendee_count || 0} attending
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* IMPORTS MODAL */}
      <ContactImportModal 
        open={showContactImport} 
        onOpenChange={setShowContactImport} 
      />
    </div>
  );
};

export default Map;
