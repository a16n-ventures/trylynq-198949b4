import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Crosshair, MapPin, Search, Plus, Eye, EyeOff, Navigation,
  MessageSquare, Calendar, Users, Loader2, X, MapPinned,
  Video, Globe, Layers, Radar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/contexts/LocationContext';
import { useFriends } from '@/hooks/useFriends';
import { ContactImportModal } from '@/components/ContactImportModal';
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
  is_premium?: boolean; // Added premium status
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

// Premium Badge Component
const PremiumBadge = () => (
  <svg 
    className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef<LeafletMapHandle>(null);
  
  // --- Global State ---
  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();
  // Using your existing hook to get the friendship list
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
  const [showDirections, setShowDirections] = useState(false);
  const [directionsDestination, setDirectionsDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);

  // --- 1. Fetch Friend Locations (FIXED) ---
  const friendIds = useMemo(() => {
    if (!user || !friends) return [];
    // CRITICAL FIX: Extract IDs from the raw friendship keys (requester_id/addressee_id)
    // This matches your original logic and ensures we actually get the UUIDs.
    return friends.map((f: any) => 
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    ).filter(Boolean);
  }, [friends, user]);

  // --- 1.5 Fetch Friend Premium Status ---
  const { data: premiumStatus = {} } = useQuery({
    queryKey: ['map_friends_premium', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return {};
      
      const { data: premiumFeatures } = await supabase
        .from('premium_features')
        .select('user_id')
        .in('user_id', friendIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('user_id, status')
        .in('user_id', friendIds)
        .eq('status', 'active');

      const premiumMap: Record<string, boolean> = {};
      premiumFeatures?.forEach(pf => { premiumMap[pf.user_id] = true; });
      subscriptions?.forEach(s => { premiumMap[s.user_id] = true; });

      return premiumMap;
    },
    enabled: friendIds.length > 0
  });

  const { data: friendLocations = [] } = useQuery({
    queryKey: ['friend-locations', friendIds],
    queryFn: async () => {
      if (friendIds.length === 0) return [];
      
      // CRITICAL FIX: Removed .eq('is_sharing_location', true)
      // We fetch ALL locations for friends. We will filter them in memory if needed.
      // This solves the "not all my contacts" issue.
      const { data } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location, updated_at')
        .in('user_id', friendIds);
        
      return data || [];
    },
    enabled: friendIds.length > 0 && activeView === 'friends',
    refetchInterval: 30000, 
  });

  // --- 2. Data Processing & Deduplication ---
  const nearbyFriendsRaw = useMemo(() => {
    if (!location) return [];

    const uniqueFriendsMap = new Map();

    friends.forEach((friendship: any) => {
      // Determine which profile is the friend
      const isRequester = friendship.requester_id === user?.id;
      const profile = isRequester ? friendship.addressee : friendship.requester;
      // Get the ID securely
      const friendId = isRequester ? friendship.addressee_id : friendship.requester_id;
      
      // Find their location data
      const loc = friendLocations.find(l => l.user_id === friendId);

      if (loc && loc.latitude && loc.longitude) {
        uniqueFriendsMap.set(friendId, {
          user_id: friendId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updated_at: loc.updated_at,
          is_sharing: loc.is_sharing_location,
          profiles: {
            display_name: profile?.display_name || 'Friend',
            avatar_url: profile?.avatar_url
          }
        });
      }
    });

    return Array.from(uniqueFriendsMap.values());
  }, [friends, friendLocations, location, user?.id]);

  // --- Fetch User's Discovery Radius from Profile ---
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60000, // Cache for 1 minute
  });

  // Extract discovery radius (in meters), default to 10km if not set
  const discoveryRadiusMeters = useMemo(() => {
    const prefs = userProfile?.preferences as { discovery_radius?: number } | null;
    const savedRadius = prefs?.discovery_radius;
    return savedRadius ?? 10000; // Default 10km in meters
  }, [userProfile]);

  // Convert to kilometers for filtering
  const discoveryRadiusKm = discoveryRadiusMeters / 1000;

  // --- UPDATE friendsMapped logic to use user's radius ---
  const friendsMapped: FriendOnMap[] = useMemo(() => {
    if (!location) return [];
    
    console.log(`🎯 Filtering friends within ${discoveryRadiusKm}km radius`);
    
    return nearbyFriendsRaw
      .map((loc: any) => {
        const dist = distanceKm(location.latitude, location.longitude, loc.latitude, loc.longitude);
        
        // ✅ USE USER'S DISCOVERY RADIUS
        if (dist > discoveryRadiusKm) {
          console.log(`⏭️ Friend "${loc.profiles?.display_name}" is ${dist.toFixed(1)}km away (outside ${discoveryRadiusKm}km radius)`);
          return null;
        }

        const online = friendsPresence[loc.user_id] === 'online';
        
        let statusText = 'Offline';
        if (online) statusText = 'Active now';
        else if (!loc.is_sharing) statusText = 'Location paused';
        else statusText = 'Active recently';

        console.log(`✅ Friend "${loc.profiles?.display_name}" included: ${dist.toFixed(1)}km away`);

        const isPremium = premiumStatus[loc.user_id] || false;

        return {
          id: loc.user_id,
          name: loc.profiles?.display_name || 'Friend',
          avatar: loc.profiles?.avatar_url,
          locationLabel: 'On the map',
          coordinates: { lat: loc.latitude, lng: loc.longitude },
          status: online ? 'online' : 'offline',
          lastSeen: statusText,
          distanceKm: Number(dist.toFixed(1)),
          latitude: loc.latitude,
          longitude: loc.longitude,
          is_premium: isPremium
        };
      })
      .filter(Boolean) as FriendOnMap[];
  }, [nearbyFriendsRaw, friendsPresence, location, discoveryRadiusKm, premiumStatus]);

  // --- UPDATE events query to use user's radius ---
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', 'nearby', location?.latitude, location?.longitude, discoveryRadiusKm],
    queryFn: async () => {
      if (!location) return [];
      
      console.log(`🎯 Fetching events within ${discoveryRadiusKm}km radius`);
      
      // ✅ Removed LIMIT to fetch ALL nearby events
      const { data } = await supabase
        .from('events')
        .select('*, creator:profiles!creator_id(display_name, avatar_url)')
        .gt('start_date', new Date().toISOString());
        
      if (!data) return [];

      return data.map((e: any) => {
        const eLat = e.latitude || 6.5244; 
        const eLng = e.longitude || 3.3792;
        const dist = distanceKm(location.latitude, location.longitude, eLat, eLng);
        
        // ✅ USE USER'S DISCOVERY RADIUS
        if (dist > discoveryRadiusKm) {
          console.log(`⏭️ Event "${e.title}" is ${dist.toFixed(1)}km away (outside ${discoveryRadiusKm}km radius)`);
          return null;
        }

        console.log(`✅ Event "${e.title}" included: ${dist.toFixed(1)}km away`);

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

  // ✅ ADDED: Format events for the map component
  const nearbyEventsForMap = useMemo(() => {
    return events.map((e: any) => ({
      user_id: e.id, // Use event ID as "user_id" for the map marker
      latitude: e.latitude,
      longitude: e.longitude,
      is_sharing: true, // Events are always "visible"
      updated_at: new Date().toISOString(),
      profiles: {
        display_name: e.title,
        avatar_url: e.image_url || e.creator?.avatar_url
      }
    }));
  }, [events]);

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
      // Safe update: don't overwrite coords, just the toggle
      await supabase.from('user_locations').upsert({ 
        user_id: user.id, 
        is_sharing_location: !newValue,
        updated_at: new Date().toISOString()
      } as any);
      setIsGhostMode(newValue);
      toast.success(newValue ? "You are now invisible" : "You are visible");
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
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* LAYER 1: MAP */}
      <div className="absolute inset-0 z-0 h-full w-full">
        {/* ✅ UPDATED: Pass either friends or events to the map based on active view */}
        <LeafletMap
          ref={mapRef}
          userLocation={location}
          friendsLocations={activeView === 'friends' ? nearbyFriendsRaw : nearbyEventsForMap} 
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

            <div className="mt-2 px-1">
              <div className="flex items-center gap-2 text-xs text-white/80 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-md">
                <Radar className="w-3 h-3" />
                <span>Showing {activeView} within <strong>{discoveryRadiusKm}km</strong></span>
              </div>
            </div>

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

        {/* BOTTOM SHEET - Fixed above bottom nav (64px height + safe area) */}
        <div className="fixed bottom-20 left-0 right-0 z-20 pointer-events-auto px-4 pb-2 max-h-[45vh]">
          {/* Recenter Button */}
          <div className="flex justify-end mb-3">
            <Button
              onClick={() => location ? mapRef.current?.recenter() : requestLocation()}
              className="rounded-full shadow-lg h-12 w-12 bg-white text-black hover:bg-gray-100"
            >
              {locationLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Crosshair className="h-6 w-6" />}
            </Button>
          </div>

          {/* Nearby List Card with horizontal scroll for items */}
          <div className="overflow-y-auto max-h-[35vh]">
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
                          <h3 className="font-bold text-lg leading-tight flex items-center gap-1">
                            {selectedFriend.name}
                            {selectedFriend.is_premium && <PremiumBadge />}
                          </h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> 
                            {selectedFriend.locationLabel}
                            {selectedFriend.distanceKm && ` • ${selectedFriend.distanceKm}km away`}
                          </p>
                          <p className="text-xs text-muted-foreground">{selectedFriend.lastSeen}</p>
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
                          const { latitude, longitude, name } = selectedFriend;
                          if (latitude && longitude) {
                            setDirectionsDestination({ lat: latitude, lng: longitude, name });
                            setShowDirections(true);
                            setSelectedFriend(null);
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
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h3 className="font-bold text-lg leading-tight truncate">{selectedEvent.title}</h3>
                          <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => setSelectedEvent(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{format(new Date(selectedEvent.start_date), 'MMM d, h:mm a')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{selectedEvent.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        className="gradient-primary text-white"
                        onClick={() => navigate(`/events/${selectedEvent.id}`)}
                      >
                        View Details
                      </Button>
                      {selectedEvent.latitude && selectedEvent.longitude && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDirectionsDestination({ 
                              lat: selectedEvent.latitude, 
                              lng: selectedEvent.longitude, 
                              name: selectedEvent.title 
                            });
                            setShowDirections(true);
                            setSelectedEvent(null);
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

                    {/* Horizontal scrollable list */}
                    {filteredList.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        {searchQuery ? `No ${activeView} match your search.` : `No ${activeView} found nearby.`}
                      </div>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                        {filteredList.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex-shrink-0 w-32 p-3 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => activeView === 'friends' ? setSelectedFriend(item) : setSelectedEvent(item)}
                          >
                            {activeView === 'friends' ? (
                              <div className="flex flex-col items-center text-center gap-2">
                                <div className="relative">
                                  <Avatar className="w-12 h-12">
                                    <AvatarImage src={item.avatar} />
                                    <AvatarFallback>{item.name[0]}</AvatarFallback>
                                  </Avatar>
                                  {item.status === 'online' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />}
                                </div>
                                <div className="w-full">
                                  <h4 className="font-medium text-xs truncate flex items-center justify-center gap-1">
                                    {item.name}
                                    {item.is_premium && <PremiumBadge />}
                                  </h4>
                                  <p className="text-[10px] text-muted-foreground">{item.distanceKm}km away</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center text-center gap-2">
                                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                  {format(new Date(item.start_date), 'd')}
                                </div>
                                <div className="w-full">
                                  <h4 className="font-medium text-xs truncate">{item.title}</h4>
                                  <p className="text-[10px] text-muted-foreground">{item.distanceKm}km away</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
            )}
          </div>
        </div>
      </div>

      <ContactImportModal open={showContactImport} onOpenChange={setShowContactImport} />
      
      {/* In-App Directions Overlay */}
      {showDirections && directionsDestination && location && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
          {/* Directions Header */}
          <div className="flex items-center gap-3 p-4 border-b bg-background">
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full"
              onClick={() => {
                setShowDirections(false);
                setDirectionsDestination(null);
              }}
            >
              <X className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h2 className="font-bold text-lg">Directions</h2>
              <p className="text-sm text-muted-foreground truncate">
                To: {directionsDestination.name}
              </p>
            </div>
          </div>
          
          {/* Embedded Map with Route */}
          <div className="flex-1 relative">
            <iframe
              className="w-full h-full border-0"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${location.latitude},${location.longitude}&destination=${directionsDestination.lat},${directionsDestination.lng}&mode=driving`}
            />
          </div>
          
          {/* Directions Footer */}
          <div className="p-4 border-t bg-background space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">Your location</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground truncate">{directionsDestination.name}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline"
                onClick={() => {
                  // Open in external Google Maps app for turn-by-turn navigation
                  const url = `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${directionsDestination.lat},${directionsDestination.lng}&travelmode=driving`;
                  window.open(url, '_blank');
                }}
              >
                <Navigation className="w-4 h-4 mr-2" />
                Open in Maps
              </Button>
              <Button 
                className="gradient-primary text-white"
                onClick={() => {
                  setShowDirections(false);
                  setDirectionsDestination(null);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPage;