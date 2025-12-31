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
import { ContactImportModal } from '@/components/map/ContactImportModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/LeafletMap';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

// Badge Component Helper
const PremiumBadge = () => (
  <svg 
    className="w-3 h-3 text-blue-500 flex-shrink-0 ml-1 inline-block align-middle" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified Premium"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

// --- Types ---
type FriendOnMap = {
  id: string;
  name: string;
  avatar?: string;
  locationLabel: string;
  coordinates?: { lat: number; lng: number } | null;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  distanceKm?: number; // Calculated distance
  is_premium?: boolean; // ✅ Added Premium Field
};

const MapPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { location, error: locationError, requestLocation, isLoading: locationLoading } = useGeolocation();
  const { friends, isLoading: friendsLoading } = useFriends(user?.id);
  const mapRef = useRef<LeafletMapHandle>(null);
  
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactImport, setShowContactImport] = useState(false);
  const [showGhostMode, setShowGhostMode] = useState(false);
  
  // Fetch real-time locations and premium status
  const { data: friendsWithLocation = [], isLoading: mapDataLoading } = useQuery({
    queryKey: ['friends_map_locations', user?.id, friends],
    queryFn: async () => {
      if (!user?.id || !friends.length) return [];
      
      const friendIds = friends.map((f: any) => 
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      if (friendIds.length === 0) return [];

      // Fetch locations
      const { data: locations, error } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, last_seen, is_sharing_location')
        .in('user_id', friendIds)
        .eq('is_sharing_location', true); // Only fetch those sharing location

      if (error) {
        console.error('Error fetching locations:', error);
        return [];
      }

      // ✅ Fetch Premium Status for friends
      const { data: premiumFeatures } = await supabase
        .from('premium_features')
        .select('user_id')
        .in('user_id', friendIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id')
        .in('user_id', friendIds)
        .eq('status', 'active');

      const premiumUserSet = new Set([
        ...(premiumFeatures?.map(p => p.user_id) || []),
        ...(subs?.map(s => s.user_id) || [])
      ]);

      // Map back to friend profiles
      const friendsOnMap: FriendOnMap[] = [];
      const now = new Date();

      locations?.forEach(loc => {
        const friendRel = friends.find((f: any) => 
          (f.requester_id === loc.user_id || f.addressee_id === loc.user_id)
        );
        
        if (friendRel) {
          const profile = friendRel.requester_id === loc.user_id ? friendRel.requester : friendRel.addressee;
          if (profile) {
            // Determine status based on last_seen
            const lastSeenDate = new Date(loc.last_seen);
            const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;
            let status: 'online' | 'away' | 'offline' = 'offline';
            
            if (diffMinutes < 15) status = 'online';
            else if (diffMinutes < 60) status = 'away';

            friendsOnMap.push({
              id: loc.user_id,
              name: profile.display_name || 'Unknown',
              avatar: profile.avatar_url,
              locationLabel: 'Nearby', // In real app, reverse geocode this
              coordinates: { lat: loc.latitude, lng: loc.longitude },
              status,
              lastSeen: lastSeenDate,
              is_premium: premiumUserSet.has(loc.user_id) // ✅ Added premium status
            });
          }
        }
      });

      return friendsOnMap;
    },
    enabled: !!user?.id && friends.length > 0,
    refetchInterval: 30000 // Refresh every 30s
  });

  // Calculate distances if user location is available
  const itemsWithDistance = useMemo(() => {
    if (!location) return friendsWithLocation;

    return friendsWithLocation.map(friend => {
      if (!friend.coordinates) return friend;
      
      // Simple Haversine formula for distance
      const R = 6371; // km
      const dLat = (friend.coordinates.lat - location.latitude) * Math.PI / 180;
      const dLon = (friend.coordinates.lng - location.longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(location.latitude * Math.PI / 180) * Math.cos(friend.coordinates.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const d = R * c;
      
      return { ...friend, distanceKm: parseFloat(d.toFixed(1)) };
    }).sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
  }, [friendsWithLocation, location]);

  const handleCenterOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.flyTo([location.latitude, location.longitude], 15);
    } else {
      requestLocation();
    }
  };

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-background flex flex-col">
      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <LeafletMap 
          ref={mapRef}
          center={location ? [location.latitude, location.longitude] : undefined}
          zoom={13}
          userLocation={location}
          friends={itemsWithDistance.map(f => ({
            ...f,
            // Pass premium info to popup via name rendering trick or handle in LeafletMap if supported
            // Since we can't easily modify LeafletMap internals from here without the file,
            // we assume standard rendering. However, if LeafletMap supports custom popups, we'd use it.
            // For now, we will just render the map.
          }))}
          onMarkerClick={(id) => console.log('Clicked friend', id)}
        />
      </div>

      {/* Floating UI */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-3 pointer-events-none">
        {/* Search Bar */}
        <div className="flex gap-2 pointer-events-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Find friends or places..." 
              className="pl-10 h-11 bg-background/90 backdrop-blur-md shadow-lg border-0 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button 
            size="icon" 
            className="h-11 w-11 rounded-xl shadow-lg bg-background/90 backdrop-blur-md text-foreground hover:bg-background"
            onClick={() => setShowContactImport(true)}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {/* Tab Filters */}
        <div className="pointer-events-auto overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-2">
            {['all', 'online', 'nearby', 'events'].map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 shadow-md ${activeTab !== tab ? 'bg-background/80 backdrop-blur-sm' : ''}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Sheet / List */}
      <div className="absolute bottom-20 left-0 right-0 z-10 px-4 pointer-events-none">
        <div className="flex flex-col gap-3">
          <div className="flex justify-end pointer-events-auto gap-2">
             <Button 
              size="icon" 
              variant="secondary"
              className="h-10 w-10 rounded-full shadow-lg bg-background/90 backdrop-blur-md"
              onClick={() => setShowGhostMode(!showGhostMode)}
            >
              {showGhostMode ? <EyeOff className="w-5 h-5 text-red-500" /> : <Eye className="w-5 h-5" />}
            </Button>
            <Button 
              size="icon" 
              className="h-10 w-10 rounded-full shadow-lg"
              onClick={handleCenterOnUser}
            >
              <Crosshair className="w-5 h-5" />
            </Button>
          </div>

          <div className="pointer-events-auto">
            {itemsWithDistance.length === 0 ? (
                <Card className="bg-background/90 backdrop-blur-xl border-0 shadow-xl rounded-2xl overflow-hidden">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-1">No friends nearby</h3>
                    <p className="text-sm text-muted-foreground mb-4">Add friends or enable location sharing to see them on the map.</p>
                    <Button onClick={() => setShowContactImport(true)} className="w-full">Find Friends</Button>
                  </CardContent>
                </Card>
            ) : (
                <Card className="bg-background/90 backdrop-blur-xl border-0 shadow-xl rounded-2xl overflow-hidden max-h-[40vh] flex flex-col">
                  <div className="p-2 border-b bg-muted/20">
                    <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto" />
                  </div>
                  <CardContent className="p-0 overflow-y-auto">
                    <div className="divide-y divide-border/50">
                      {mapDataLoading ? (
                        <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>
                      ) : (
                        itemsWithDistance.map((item: any) => (
                          <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => {
                              if (mapRef.current && item.coordinates) {
                                mapRef.current.flyTo([item.coordinates.lat, item.coordinates.lng], 16);
                              }
                            }}
                          >
                            {item.avatar ? (
                              <div className="relative">
                                <Avatar className="w-10 h-10 border border-background shadow-sm">
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
                                <h4 className="font-medium text-sm truncate flex items-center">
                                  {item.name || item.title}
                                  {/* ✅ Premium Badge */}
                                  {item.is_premium && <PremiumBadge />}
                                </h4>
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

export default MapPage;
