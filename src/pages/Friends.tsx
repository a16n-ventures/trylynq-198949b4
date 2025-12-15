import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Search, Filter, ArrowUpDown, Loader2, MapPin, User, Mail, Radar } from "lucide-react"; 
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
import { FriendCard } from "@/components/friends/FriendCard";
import { RequestCard } from "@/components/friends/RequestCard";
import { NearbyUserCard } from "@/components/friends/NearbyUserCard";
import { ContactCard } from "@/components/friends/ContactCard";
import { FriendProfilePreview } from "@/components/friends/FriendProfilePreview";
import { BlockReportDialog } from "@/components/friends/BlockReportDialog";
import { AddContactForm } from "@/components/friends/AddContactForm";

// Utilities
const DEBOUNCE_DELAY = 500;
const MAX_NEARBY_USERS = 50;
const LOCATION_CHANGE_THRESHOLD_KM = 0.1;
const REFRESH_INTERVAL_MS = 120000;

/**
 * useDebounce hook
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Haversine Formula for Client-Side Distance Calculation
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
}

/**
 * Safe display name formatter
 */
function getDisplayName(name: string | null | undefined): string {
  return name?.trim() || '';
}

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

  // Fetch user's discovery radius from profile
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

  // Calculate radius in KM from saved preferences (stored in meters)
  const NEARBY_RADIUS_KM = useMemo(() => {
    const savedRadius = userProfile?.preferences?.discovery_radius;
    return savedRadius ? savedRadius / 1000 : 10;
  }, [userProfile]); 
  
  // State
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, DEBOUNCE_DELAY);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [activeTab, setActiveTab] = useState<TabValue>("friends");
  const [requestView, setRequestView] = useState<RequestView>('received');
  const [discoverView, setDiscoverView] = useState<DiscoverView>('nearby');
  const [showAddContact, setShowAddContact] = useState(false);
  
  // Profile preview state
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();
  
  // Block/Report dialog state
  const [blockReportDialog, setBlockReportDialog] = useState<{
    open: boolean;
    type: 'block' | 'report';
    userId: string;
    userName?: string;
  }>({ open: false, type: 'block', userId: '' });

  const [nearbyError, setNearbyError] = useState<string | null>(null);

  // Hooks
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

  // Geolocation & Nearby Users
  const { location: userLocation, requestLocation, isLoading: isLocationLoading } = useGeolocation();
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isFetchingFriends, setIsFetchingFriends] = useState(false);
  
  // Refs to prevent flickering and unnecessary refetches
  const isFetchingRef = useRef(false);
  const lastFetchLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const nearbyDataCacheRef = useRef<NearbyUser[]>([]);
  const hasInitializedRef = useRef(false);

  /**
   * Check if location has changed significantly
   */
  const hasLocationChangedSignificantly = useCallback((newLat: number, newLon: number): boolean => {
    if (!lastFetchLocationRef.current) return true;
    const { lat, lon } = lastFetchLocationRef.current;
    const distance = calculateDistance(lat, lon, newLat, newLon);
    return distance > LOCATION_CHANGE_THRESHOLD_KM;
  }, []);

  // Combine loading states - only show loading on initial load
  const loadingNearby = (isLocationLoading || isFetchingFriends) && !hasInitializedRef.current;

  /**
   * Main fetch function with better error handling and data validation
   */
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
      // 1. Get IDs of people I am already friends with or have pending requests with
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

      // 2. Fetch locations of ALL users within reasonable range
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

      // 3. Client-Side Filtering & Deduplication with validation
      const uniqueCandidatesMap = new Map();
      
      allLocations.forEach(loc => {
        if (!loc.user_id || 
            typeof loc.latitude !== 'number' || 
            typeof loc.longitude !== 'number' ||
            isNaN(loc.latitude) || 
            isNaN(loc.longitude)) {
          return;
        }

        if (!excludedIds.has(loc.user_id) && !uniqueCandidatesMap.has(loc.user_id)) {
          const dist = calculateDistance(
            userLocation.latitude, 
            userLocation.longitude, 
            loc.latitude, 
            loc.longitude
          );
          
          // ✅ FIXED: Add the radius filter here
          if (dist <= NEARBY_RADIUS_KM && !isNaN(dist)) {
            uniqueCandidatesMap.set(loc.user_id, { 
              ...loc, 
              distance: dist 
            });
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

      // 4. Fetch Profiles for the valid candidates
      const candidateIds = validCandidates.map((c: any) => c.user_id);
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', candidateIds);

      if (profError) throw profError;

      console.log('📊 Nearby Users Debug:', {
        totalCandidates: validCandidates.length,
        profilesFetched: profiles?.length || 0,
        sampleProfile: profiles?.[0],
        candidateIds: candidateIds.slice(0, 3)
      });

      // 5. Merge Data with proper null handling and multiple fallbacks
      const formatted: NearbyUser[] = validCandidates
        .map((candidate: any) => {
          const profile = profiles?.find(p => p.user_id === candidate.user_id);
          
          const displayName = profile?.display_name || 
                             profile?.email?.split('@')[0] || 
                             `User${candidate.user_id.slice(-4)}`;
          
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
      lastFetchLocationRef.current = {
        lat: userLocation.latitude,
        lon: userLocation.longitude
      };
      
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

  /**
   * Effect with proper cleanup
   */
  useEffect(() => {
    if (activeTab !== 'discover' || discoverView !== 'nearby') {
      return;
    }

    if (!userLocation) {
      if (!isLocationLoading) {
        requestLocation();
      }
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

  /**
   * Filtered friends with null safety
   */
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
      c.email?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [contacts, debouncedSearch]);

  // Handlers
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
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            Requests
            {incomingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold animate-pulse">
                {incomingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>

        {/* FRIENDS TAB */}
        <TabsContent value="friends" className="mt-4 space-y-2">
          {isLoading.friends ? (
            <FriendSkeleton />
          ) : filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">
                {search ? 'No friends found' : 'No friends yet'}
              </p>
              <Button variant="outline" onClick={() => setActiveTab('discover')} className="mt-2">
                Find Friends
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map(f => {
                const friend = f.requester_id === userId ? f.addressee : f.requester;
                return (
                  <FriendCard
                    key={f.id}
                    friendship={f}
                    currentUserId={userId!}
                    onRemove={(id) => mutations.removeFriend.mutate(id)}
                    onBlock={(id) => handleOpenBlockDialog(id, getDisplayName(friend?.display_name))}
                    onReport={(id) => handleOpenReportDialog(id, getDisplayName(friend?.display_name))}
                    onViewProfile={(profile) => handleViewProfile(profile, f.id)}
                    isRemoving={mutations.removeFriend.isPending}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button 
              onClick={() => setRequestView('received')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                requestView === 'received' 
                  ? 'bg-background shadow-sm font-medium text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Received {incomingRequests.length > 0 && `(${incomingRequests.length})`}
            </button>
            <button 
              onClick={() => setRequestView('sent')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                requestView === 'sent' 
                  ? 'bg-background shadow-sm font-medium text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
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
                incomingRequests.map(r => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    type="incoming"
                    onAccept={(id) => mutations.acceptRequest.mutate(id)}
                    onReject={(id) => mutations.rejectRequest.mutate(id)}
                    isAccepting={mutations.acceptRequest.isPending}
                    isRejecting={mutations.rejectRequest.isPending}
                  />
                ))
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
                outgoingRequests.map(r => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    type="outgoing"
                    onCancel={(id) => mutations.cancelRequest.mutate(id)}
                    isCancelling={mutations.cancelRequest.isPending}
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>

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
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => navigate('/app/profile')}
                  >
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
                      <Button variant="outline" size="sm" onClick={fetchNearbyUsers}>
                        Try Again
                      </Button>
                    </CardContent>
                  </Card>
                ) : nearbyUsers.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No one within {NEARBY_RADIUS_KM}km</p>
                    <p className="text-xs mt-1">Invite friends to join!</p>
                  </div>
                ) : (
                  nearbyUsers.map(p => (
                    <NearbyUserCard
                      key={p.user_id}
                      profile={p}
                      onAddFriend={(profile) => mutations.sendRequest.mutate(profile)}
                      isAdding={mutations.sendRequest.isPending && mutations.sendRequest.variables?.user_id === p.user_id}
                    />
                  ))
                )}
              </div> 
            </>
          )}
                    
          {/* CONTACTS VIEW */}
          {discoverView === 'contacts' && (
            <div className="space-y-3">
              {showAddContact ? (
                <AddContactForm
                  onSubmit={(data) => {
                    addContact.mutate(data);
                    setShowAddContact(false);
                  }}
                  onCancel={() => setShowAddContact(false)}
                  isPending={addContact.isPending}
                />
              ) : (
                <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white" onClick={() => setShowAddContact(true)}>
                  <User className="w-4 h-4 mr-2" /> Add New Contact
                </Button>
              )}

              {loadingContacts ? (
                <FriendSkeleton />
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No contacts match your search' : !showAddContact && 'No contacts yet. Add someone to invite them!'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onInvite={(c) => inviteContact.mutate(c)}
                      onDelete={(id) => deleteContact.mutate(id)}
                      isInviting={inviteContact.isPending && inviteContact.variables?.id === contact.id}
                      isDeleting={deleteContact.isPending}
                    />
                  ))}
                </div>
              )}

              {!showAddContact && contacts.length > 0 && (
                <Card className="border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-blue-900 dark:text-blue-100">Invite friends to join</p>
                        <p className="text-blue-700 dark:text-blue-300 text-xs">Click "Invite" to send them a link via SMS or Email.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
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
