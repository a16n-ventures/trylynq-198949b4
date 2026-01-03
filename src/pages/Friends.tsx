import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { 
  Search, Filter, ArrowUpDown, Loader2, MapPin, User, Mail, Radar,
  MessageSquare, MoreVertical, UserMinus, Ban, ShieldAlert, Check, X, UserPlus,
  Users
} from "lucide-react"; 
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from '@/contexts/LocationContext';

// Hooks
import { useFriends, type Profile } from "@/hooks/useFriends";
import { useContacts } from "@/hooks/useContacts";

// Components
import { FriendSkeleton } from "@/components/friends/FriendSkeleton";
import { FriendProfilePreview } from "@/components/friends/FriendProfilePreview";
import { BlockReportDialog } from "@/components/friends/BlockReportDialog";
import { ContactImportModal } from "@/components/ContactImportModal";

// Utilities
const DEBOUNCE_DELAY = 500;
const MAX_NEARBY_USERS = 50;
const LOCATION_CHANGE_THRESHOLD_KM = 0.1;
const REFRESH_INTERVAL_MS = 120000;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
}

function getDisplayName(name: string | null | undefined): string {
  return name?.trim() || 'Unknown User';
}

// Verified Badge Component (Blue Checkmark)
const VerifiedBadge = () => (
  <svg 
    className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

type SortOption = 'newest' | 'alphabetical';
type TabValue = 'friends' | 'requests' | 'discover';
type RequestView = 'received' | 'sent';
type DiscoverView = 'nearby' | 'contacts';

interface NearbyUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  distance_km: number;
  match_score: number;
}

export default function Friends() {
  const { user } = useAuth();
  const userId = user?.id; 
  const navigate = useNavigate(); 

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-radius', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', userId)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 60000,
  });

  const NEARBY_RADIUS_KM = useMemo(() => {
    const savedRadius = userProfile?.preferences?.discovery_radius;
    return savedRadius ? savedRadius / 1000 : 10;
  }, [userProfile]); 
  
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, DEBOUNCE_DELAY);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [activeTab, setActiveTab] = useState<TabValue>("discover");
  const [requestView, setRequestView] = useState<RequestView>('received');
  const [discoverView, setDiscoverView] = useState<DiscoverView>('nearby');
  const [showAddContact, setShowAddContact] = useState(false);
  
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();
  
  const [blockReportDialog, setBlockReportDialog] = useState<{
    open: boolean;
    type: 'block' | 'report';
    userId: string;
    userName?: string;
  }>({ open: false, type: 'block', userId: '' });

  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const {
    friends,
    incomingRequests,
    outgoingRequests,
    isLoading,
    mutations
  } = useFriends(userId);

  const {
    contacts,
    isLoading: loadingContacts,
    addContact,
    deleteContact,
    inviteContact,
  } = useContacts(userId);

  const { location: userLocation, requestLocation, isLoading: isLocationLoading } = useGeolocation();
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isFetchingFriends, setIsFetchingFriends] = useState(false);
  
  const isFetchingRef = useRef(false);
  const lastFetchLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const nearbyDataCacheRef = useRef<NearbyUser[]>([]);
  const hasInitializedRef = useRef(false);

  // --- Fetch Premium/Verified Status ---
  const allRelevantUserIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach(f => {
      ids.add(f.requester_id === userId ? f.addressee_id : f.requester_id);
    });
    incomingRequests.forEach(r => ids.add(r.requester_id));
    outgoingRequests.forEach(r => ids.add(r.addressee_id));
    nearbyUsers.forEach(n => ids.add(n.user_id));
    return Array.from(ids);
  }, [friends, incomingRequests, outgoingRequests, nearbyUsers, userId]);

  const { data: premiumStatus = {} } = useQuery({
    queryKey: ['friends_page_premium', allRelevantUserIds],
    queryFn: async () => {
      if (allRelevantUserIds.length === 0) return {};
      
      const { data: premiumFeatures } = await supabase
        .from('premium_features')
        .select('user_id')
        .in('user_id', allRelevantUserIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('user_id, status')
        .in('user_id', allRelevantUserIds)
        .eq('status', 'active');

      const premiumMap: Record<string, boolean> = {};
      premiumFeatures?.forEach(pf => { premiumMap[pf.user_id] = true; });
      subscriptions?.forEach(s => { premiumMap[s.user_id] = true; });

      return premiumMap;
    },
    enabled: allRelevantUserIds.length > 0,
    staleTime: 60000
  });

  // --- Mutual Connections Logic ---
  const myFriendIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach(f => {
      ids.add(f.requester_id === userId ? f.addressee_id : f.requester_id);
    });
    return ids;
  }, [friends, userId]);

  const contactUsernames = useMemo(() => 
    contacts
      .map(c => c.username)
      .filter((u): u is string => !!u), 
    [contacts]
  );

  const { data: contactProfiles } = useQuery({
    queryKey: ['contact-profiles', contactUsernames],
    queryFn: async () => {
      if (contactUsernames.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('username', contactUsernames);
      return data || [];
    },
    enabled: contactUsernames.length > 0,
    staleTime: 300000 // 5 minutes
  });

  const registeredContactMap = useMemo(() => {
    const map = new Map<string, { user_id: string; avatar_url?: string; display_name?: string }>();
    contactProfiles?.forEach(p => {
      if (p.username) map.set(p.username, { user_id: p.user_id, avatar_url: p.avatar_url || undefined, display_name: p.display_name || undefined });
    });
    return map;
  }, [contactProfiles]);

  const contactUserIds = useMemo(() => contactProfiles?.map(p => p.user_id) || [], [contactProfiles]);

  const { data: contactFriendships } = useQuery({
    queryKey: ['contact-friendships', contactUserIds],
    queryFn: async () => {
      if (contactUserIds.length === 0) return [];
      // Fetch public friendships for contacts to calculate mutuals
      const { data } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.in.(${contactUserIds.join(',')}),addressee_id.in.(${contactUserIds.join(',')})`)
        .eq('status', 'accepted'); 
      return data || [];
    },
    enabled: contactUserIds.length > 0 && contactUserIds.length < 50, // Safety cap to avoid huge query
    staleTime: 300000
  });

  const mutualCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!contactProfiles || !contactFriendships) return counts;

    contactProfiles.forEach(p => {
      if (!p.username) return;
      
      const theirFriendIds = new Set<string>();
      contactFriendships.forEach(f => {
        if (f.requester_id === p.user_id) theirFriendIds.add(f.addressee_id);
        if (f.addressee_id === p.user_id) theirFriendIds.add(f.requester_id);
      });

      let mutual = 0;
      theirFriendIds.forEach(id => {
        if (myFriendIds.has(id)) mutual++;
      });
      
      counts[p.username] = mutual;
    });
    return counts;
  }, [contactProfiles, contactFriendships, myFriendIds]);

  const hasLocationChangedSignificantly = useCallback((newLat: number, newLon: number): boolean => {
    if (!lastFetchLocationRef.current) return true;
    const { lat, lon } = lastFetchLocationRef.current;
    const distance = calculateDistance(lat, lon, newLat, newLon);
    return distance > LOCATION_CHANGE_THRESHOLD_KM;
  }, []);

  const loadingNearby = (isLocationLoading || isFetchingFriends) && !hasInitializedRef.current;

  const fetchNearbyUsers = useCallback(async () => {
    if (!userId || !userLocation) return;
    if (isFetchingRef.current) return;
    
    if (!hasLocationChangedSignificantly(userLocation.latitude, userLocation.longitude)) {
      if (nearbyDataCacheRef.current.length > 0) {
        setNearbyUsers(nearbyDataCacheRef.current);
        return;
      }
    }

    isFetchingRef.current = true;
    setIsFetchingFriends(true);
    setNearbyError(null);

    try {
      const { data: existingFriendships, error: friendshipError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      
      if (friendshipError) throw friendshipError;
      
      const excludedIds = new Set<string>();
      excludedIds.add(userId);
      existingFriendships?.forEach(f => {
        excludedIds.add(f.requester_id);
        excludedIds.add(f.addressee_id);
      });

      const { data: allLocations, error: locError } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, last_seen')
        .not('user_id', 'eq', userId)
        .order('last_seen', { ascending: false })
        .limit(500);

      if (locError) throw locError;

      if (!allLocations || allLocations.length === 0) {
        setNearbyUsers([]);
        nearbyDataCacheRef.current = [];
        hasInitializedRef.current = true;
        return;
      }

      const uniqueCandidatesMap = new Map();
      
      allLocations.forEach(loc => {
        if (!loc.user_id || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;

        if (!excludedIds.has(loc.user_id) && !uniqueCandidatesMap.has(loc.user_id)) {
          const dist = calculateDistance(userLocation.latitude, userLocation.longitude, loc.latitude, loc.longitude);
          if (dist <= NEARBY_RADIUS_KM) {
            uniqueCandidatesMap.set(loc.user_id, { ...loc, distance: dist });
          }
        }
      });

      const validCandidates = Array.from(uniqueCandidatesMap.values())
        .sort((a: any, b: any) => a.distance - b.distance)
        .slice(0, MAX_NEARBY_USERS);

      if (validCandidates.length === 0) {
        setNearbyUsers([]);
        nearbyDataCacheRef.current = [];
        hasInitializedRef.current = true;
        return;
      }

      const candidateIds = validCandidates.map((c: any) => c.user_id);
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url, email')
        .in('user_id', candidateIds);

      if (profError) throw profError;

      const formatted: NearbyUser[] = validCandidates
        .map((candidate: any) => {
          const profile = profiles?.find(p => p.user_id === candidate.user_id);
          const displayName = profile?.display_name || profile?.username || profile?.email?.split('@')[0] || `User${candidate.user_id.slice(-4)}`;
          
          return {
            user_id: candidate.user_id,
            display_name: displayName,
            avatar_url: profile?.avatar_url || null,
            distance_km: candidate.distance,
            match_score: Math.max(0, 100 - candidate.distance)
          };
        })
        .filter((user): user is NearbyUser => user !== null);

      nearbyDataCacheRef.current = formatted;
      lastFetchLocationRef.current = { lat: userLocation.latitude, lon: userLocation.longitude };
      setNearbyUsers(formatted);
      hasInitializedRef.current = true;

    } catch (err) {
      console.error("Discovery error:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load nearby users';
      setNearbyError(errorMessage);
      if (nearbyDataCacheRef.current.length > 0) {
        setNearbyUsers(nearbyDataCacheRef.current);
      }
    } finally {
      setIsFetchingFriends(false);
      isFetchingRef.current = false;
    }
  }, [userId, userLocation, hasLocationChangedSignificantly, NEARBY_RADIUS_KM]);

  useEffect(() => {
    if (activeTab !== 'discover' || discoverView !== 'nearby') return;

    if (!userLocation) {
      if (!isLocationLoading) requestLocation();
      return;
    }

    if (nearbyDataCacheRef.current.length > 0 && !hasInitializedRef.current) {
      setNearbyUsers(nearbyDataCacheRef.current);
      hasInitializedRef.current = true;
    }

    fetchNearbyUsers();
    const refreshInterval = setInterval(() => {
      if (userLocation && hasLocationChangedSignificantly(userLocation.latitude, userLocation.longitude)) {
        fetchNearbyUsers();
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(refreshInterval);
  }, [activeTab, discoverView, userLocation, isLocationLoading, requestLocation, fetchNearbyUsers, hasLocationChangedSignificantly]);

  const filteredFriends = useMemo(() => {
    let res = [...friends];
    if (debouncedSearch) {
      res = res.filter(f => {
        const p = f.requester_id === userId ? f.addressee : f.requester;
        const displayName = getDisplayName(p?.display_name);
        return displayName.toLowerCase().includes(debouncedSearch.toLowerCase());
      });
    }
    res.sort((a, b) => {
      const pA = a.requester_id === userId ? a.addressee : a.requester;
      const pB = b.requester_id === userId ? b.addressee : b.requester;
      return sortOption === 'alphabetical' 
        ? getDisplayName(pA?.display_name).localeCompare(getDisplayName(pB?.display_name))
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return res;
  }, [friends, debouncedSearch, sortOption, userId]);

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch) return contacts;
    return contacts.filter(c => 
      c.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.username?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [contacts, debouncedSearch]);

  const handleViewProfile = (profile: Profile, friendshipId?: string) => {
    setPreviewProfile(profile);
    setPreviewFriendshipId(friendshipId);
  };

  const handleOpenBlockDialog = (userId: string, userName?: string) => {
    setBlockReportDialog({ open: true, type: 'block', userId, userName });
  };

  const handleOpenReportDialog = (userId: string, userName?: string) => {
    setBlockReportDialog({ open: true, type: 'report', userId, userName });
  };

  const handleBlockReport = (reason: string) => {
    if (blockReportDialog.type === 'block') {
      mutations.blockUser.mutate({ blockedId: blockReportDialog.userId, reason });
    } else {
      mutations.reportUser.mutate({ targetId: blockReportDialog.userId, reason });
    }
    setBlockReportDialog({ open: false, type: 'block', userId: '' });
  };

  return (
    <div className="container-mobile py-4 space-y-4 min-h-[80vh] pb-20">
      <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
      
      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search..."
            className="pl-10 bg-background/50 backdrop-blur-sm"
          />
          {search !== debouncedSearch && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOption('newest')}>
              <ArrowUpDown className="mr-2 h-4 w-4" /> Newest First
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption('alphabetical')}>
              <Filter className="mr-2 h-4 w-4" /> Alphabetical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/30 p-1 rounded-xl">
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            Requests
            {incomingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold animate-pulse">
                {incomingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="friends">Friends</TabsTrigger>
        </TabsList>

        {/* DISCOVER TAB */}
        <TabsContent value="discover" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button 
              onClick={() => setDiscoverView('nearby')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all flex items-center gap-1 ${
                discoverView === 'nearby' 
                  ? 'bg-background shadow-sm font-medium text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MapPin className="w-3 h-3" /> Nearby
            </button>
            <button 
              onClick={() => setDiscoverView('contacts')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                discoverView === 'contacts' 
                  ? 'bg-background shadow-sm font-medium text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              My Contacts {contacts.length > 0 && `(${contacts.length})`}
            </button>
          </div>

          {/* NEARBY VIEW */} 
          {discoverView === 'nearby' && (
            <>
              <div className="mb-3 px-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Radar className="w-3 h-3" />
                    <span>Search radius: <strong>{NEARBY_RADIUS_KM}km</strong></span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate('/app/profile')}>
                    Adjust in Profile →
                  </Button>
                </div>
              </div> 
              
              <div className="space-y-2">
                {!userLocation ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <MapPin className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-muted-foreground text-sm">Enable location to see nearby people</p>
                      <Button variant="outline" className="mt-3" onClick={requestLocation}>
                        <MapPin className="w-4 h-4 mr-2" /> Enable Location
                      </Button>
                    </CardContent>
                  </Card>
                ) : loadingNearby ? (
                  <FriendSkeleton />
                ) : nearbyError ? (
                  <Card className="border-destructive/50">
                    <CardContent className="py-8 text-center">
                      <p className="text-destructive text-sm mb-2">Failed to load nearby users</p>
                      <Button variant="outline" size="sm" onClick={fetchNearbyUsers}>Try Again</Button>
                    </CardContent>
                  </Card>
                ) : nearbyUsers.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No one within {NEARBY_RADIUS_KM}km</p>
                    <p className="text-xs mt-1">Invite friends to join!</p>
                  </div>
                ) : (
                  // INLINE NEARBY USER CARD
                  nearbyUsers.map(p => {
                    const isAdding = mutations.sendRequest.isPending && mutations.sendRequest.variables?.user_id === p.user_id;
                    const isVerified = premiumStatus[p.user_id] || false;
                    
                    return (
                      <Card key={p.user_id} className="overflow-hidden">
                        <CardContent className="p-3 flex items-center gap-3">
                          <Avatar className="h-12 w-12 border-2 border-background">
                            <AvatarImage src={p.avatar_url || undefined} />
                            <AvatarFallback>{p.display_name[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                                <h4 className="font-semibold truncate text-sm">{p.display_name}</h4>
                                {isVerified && <VerifiedBadge />}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {p.distance_km.toFixed(1)}km
                              </span>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => mutations.sendRequest.mutate({ user_id: p.user_id })}
                            disabled={isAdding}
                            className="shrink-0"
                          >
                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div> 
            </>
          )}
                    
          {/* CONTACTS VIEW */}
          {discoverView === 'contacts' && (
            <div className="space-y-3 mx-auto">
              {/* ✅ FIXED: Render Button and Modal separately */}
              <Button 
                className="w-fit bg-gradient-to-r from-blue-500 to-purple-500 text-white" 
                onClick={() => setShowAddContact(true)}
              >
                <User className="w-4 h-4 mr-2" /> Add New Contact
              </Button>

              {/* The Modal controls its own visibility via props */}
              <ContactImportModal 
                open={showAddContact} 
                onOpenChange={setShowAddContact}
              />

              {loadingContacts ? (
                <FriendSkeleton />
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No contacts match your search' : 'No contacts yet. Add someone to invite them!'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => {
                     const isDeleting = deleteContact.isPending;
                     
                     // Check if contact is a registered user
                     const registeredUser = contact.username ? registeredContactMap.get(contact.username) : null;
                     const mutualCount = contact.username ? mutualCounts[contact.username] : 0;
                     
                     return (
                      <Card key={contact.id}>
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {registeredUser ? (
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={registeredUser.avatar_url} />
                                    <AvatarFallback>{registeredUser.display_name?.[0]?.toUpperCase() || contact.name?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {contact.name?.[0]?.toUpperCase() || contact.username?.[0]?.toUpperCase()}
                                </div>
                            )}
                            
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <h4 className="font-medium text-sm truncate">{contact.name || registeredUser?.display_name || 'Unknown'}</h4>
                                {registeredUser && premiumStatus[registeredUser.user_id] && <VerifiedBadge />}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mb-0.5">
                                {contact.username ? `@${contact.username}` : contact.phone}
                              </p>
                              {mutualCount > 0 && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Users className="w-3 h-3" />
                                  <span>{mutualCount} mutual connection{mutualCount !== 1 ? 's' : ''}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                             {/* ✅ ACTION BUTTON: Only 'Message' (if registered) and 'Remove' */}
                             {registeredUser && (
                                <Button size="sm" onClick={() => navigate(`/app/messages?tab=dm?userId=${registeredUser.user_id}`)}>
                                    <MessageSquare className="w-3.5 h-3.5 mr-1" /> Message
                                </Button>
                             )}
                             
                             <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100" onClick={() => deleteContact.mutate(contact.id!)} disabled={isDeleting}>
                                <X className="w-4 h-4" />
                             </Button>
                          </div>
                        </CardContent>
                      </Card>
                     );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button 
              onClick={() => setRequestView('received')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                requestView === 'received' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Received {incomingRequests.length > 0 && `(${incomingRequests.length})`}
            </button>
            <button 
              onClick={() => setRequestView('sent')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                requestView === 'sent' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sent {outgoingRequests.length > 0 && `(${outgoingRequests.length})`}
            </button>
          </div>

          {requestView === 'received' && (
            <div className="space-y-2">
              {isLoading.incoming ? (
                <FriendSkeleton />
              ) : incomingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No pending requests</div>
              ) : (
                // INLINE INCOMING REQUEST CARD
                incomingRequests.map(r => {
                  const isVerified = premiumStatus[r.requester_id] || false;
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="h-12 w-12 cursor-pointer" onClick={() => handleViewProfile(r.requester!, r.id)}>
                          <AvatarImage src={r.requester?.avatar_url || undefined} />
                          <AvatarFallback>{r.requester?.display_name?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                             <h4 className="font-semibold text-sm truncate">{getDisplayName(r.requester?.display_name)}</h4>
                             {isVerified && <VerifiedBadge />}
                          </div>
                          <p className="text-xs text-muted-foreground">Wants to be friends</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => mutations.acceptRequest.mutate(r.id)} disabled={mutations.acceptRequest.isPending}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => mutations.rejectRequest.mutate(r.id)} disabled={mutations.rejectRequest.isPending}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {requestView === 'sent' && (
            <div className="space-y-2">
              {isLoading.outgoing ? (
                <FriendSkeleton />
              ) : outgoingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No sent requests</div>
              ) : (
                // INLINE OUTGOING REQUEST CARD
                outgoingRequests.map(r => {
                  const isVerified = premiumStatus[r.addressee_id] || false;
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="h-10 w-10 opacity-70">
                          <AvatarImage src={r.addressee?.avatar_url || undefined} />
                          <AvatarFallback>{r.addressee?.display_name?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                             <h4 className="font-medium text-sm truncate">{getDisplayName(r.addressee?.display_name)}</h4>
                             {isVerified && <VerifiedBadge />}
                          </div>
                          <p className="text-xs text-muted-foreground">Request sent</p>
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => mutations.cancelRequest.mutate(r.id)} disabled={mutations.cancelRequest.isPending}>
                           Cancel
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </TabsContent>

        {/* FRIENDS TAB */}
        <TabsContent value="friends" className="mt-4 space-y-2">
          {isLoading.friends ? (
            <FriendSkeleton />
          ) : filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">{search ? 'No friends found' : 'No friends yet'}</p>
              <Button variant="outline" onClick={() => setActiveTab('discover')} className="mt-2">Find Friends</Button>
            </div>
          ) : (
            // INLINE FRIEND CARD
            <div className="space-y-2">
              {filteredFriends.map(f => {
                const friend = f.requester_id === userId ? f.addressee : f.requester;
                const friendId = friend?.user_id || (f.requester_id === userId ? f.addressee_id : f.requester_id);
                const isVerified = premiumStatus[friendId] || false;
                
                return (
                  <Card key={f.id} className="overflow-hidden hover:bg-muted/30 transition-colors">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar className="h-12 w-12 cursor-pointer border-2 border-transparent hover:border-primary transition-all" onClick={() => friend && handleViewProfile(friend, f.id)}>
                        <AvatarImage src={friend?.avatar_url || undefined} />
                        <AvatarFallback>{friend?.display_name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0" onClick={() => friend && handleViewProfile(friend, f.id)}>
                        <div className="flex items-center gap-1">
                          <h4 className="font-bold text-sm truncate">{getDisplayName(friend?.display_name)}</h4>
                          {isVerified && <VerifiedBadge />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {friend?.username ? `@${friend.username}` : 'Friend'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="rounded-full h-8 w-8 text-primary" onClick={() => navigate(`/app/messages?tab=dm?userId=${friendId}`)}>
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="rounded-full h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => friend && handleViewProfile(friend, f.id)}>
                              <User className="w-4 h-4 mr-2" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/app/messages?tab=dm?userId=${friendId}`)}>
                              <MessageSquare className="w-4 h-4 mr-2" /> Message
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => mutations.removeFriend.mutate(f.id)}>
                              <UserMinus className="w-4 h-4 mr-2" /> Remove Friend
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleOpenBlockDialog(friendId, getDisplayName(friend?.display_name))}>
                              <Ban className="w-4 h-4 mr-2" /> Block User
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-orange-500 focus:text-orange-500" onClick={() => handleOpenReportDialog(friendId, getDisplayName(friend?.display_name))}>
                              <ShieldAlert className="w-4 h-4 mr-2" /> Report
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <FriendProfilePreview
        profile={previewProfile}
        open={!!previewProfile}
        onClose={() => setPreviewProfile(null)}
        friendshipId={previewFriendshipId}
        onRemoveFriend={(id) => mutations.removeFriend.mutate(id)}
        onBlockUser={(id) => {
          setPreviewProfile(null);
          handleOpenBlockDialog(id, getDisplayName(previewProfile?.display_name));
        }}
        onReportUser={(id) => {
          setPreviewProfile(null);
          handleOpenReportDialog(id, getDisplayName(previewProfile?.display_name));
        }}
      />

      <BlockReportDialog
        open={blockReportDialog.open}
        onClose={() => setBlockReportDialog({ open: false, type: 'block', userId: '' })}
        type={blockReportDialog.type}
        userName={blockReportDialog.userName}
        onConfirm={handleBlockReport}
        isPending={mutations.blockUser.isPending || mutations.reportUser.isPending}
      />
    </div>
  );
}
