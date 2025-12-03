import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, MessageSquare, UserPlus, Check, X, Filter, ArrowUpDown, Clock, Loader2, Send, Mail, User, MapPin
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- CONSTANTS ---
const STALE_TIME = 30000;
const DEBOUNCE_DELAY = 500;
const INVITE_COOLDOWN = 24 * 60 * 60 * 1000;
const NEARBY_RADIUS_KM = 10;

// --- UTILS ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const sanitizePhone = (phone: string): string => phone.replace(/\D/g, '');

const wasInvitedRecently = (invitedAt: string | null | undefined): boolean => {
  if (!invitedAt) return false;
  return (new Date().getTime() - new Date(invitedAt).getTime()) < INVITE_COOLDOWN;
};

// --- TYPES ---
type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type NearbyProfile = Profile & {
  distance_km?: number;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester: Profile;
  addressee: Profile;
};

type Contact = {
  id: string;
  user_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  invited_at?: string | null;
  is_app_user?: boolean | null;
  matched_user_id?: string | null;
};

type SortOption = 'newest' | 'alphabetical';
type TabValue = 'friends' | 'requests' | 'discover';
type RequestView = 'received' | 'sent';
type DiscoverView = 'nearby' | 'contacts';

// --- SKELETON ---
const FriendSkeleton = () => (
  <div className="space-y-3" role="status" aria-label="Loading">
    {[1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-3 p-4 bg-muted/10 rounded-xl">
        <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="w-1/3 h-4 bg-muted animate-pulse rounded" />
          <div className="w-1/4 h-3 bg-muted/50 animate-pulse rounded" />
        </div>
      </div>
    ))}
  </div>
);

export default function Friends() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, DEBOUNCE_DELAY);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [activeTab, setActiveTab] = useState<TabValue>("friends");
  const [requestView, setRequestView] = useState<RequestView>('received');
  const [discoverView, setDiscoverView] = useState<DiscoverView>('nearby');
  
  // Contact form state
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // User location state
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Location error:', error);
        }
      );
    }
  }, []);

  // ============ QUERIES ============

  // 1. Friends (Accepted connections only)
  const { data: friends = [], isPending: loadingFriends, error: friendsError } = useQuery({
    queryKey: ['friends', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id, requester_id, addressee_id, status, created_at, 
          requester:profiles!requester_id(user_id, display_name, avatar_url), 
          addressee:profiles!addressee_id(user_id, display_name, avatar_url)
        `)
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        status: item.status as 'pending' | 'accepted' | 'declined',
        requester: item.requester || { user_id: item.requester_id, display_name: null, avatar_url: null },
        addressee: item.addressee || { user_id: item.addressee_id, display_name: null, avatar_url: null }
      }));
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // 2. Incoming (Received) Requests
  const { data: incomingRequests = [], isPending: loadingIncoming, error: incomingError } = useQuery({
    queryKey: ['friendRequests', 'incoming', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id, requester_id, addressee_id, status, created_at, 
          requester:profiles!requester_id(user_id, display_name, avatar_url), 
          addressee:profiles!addressee_id(user_id, display_name, avatar_url)
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        status: item.status as 'pending' | 'accepted' | 'declined',
        requester: item.requester || { user_id: item.requester_id, display_name: null, avatar_url: null },
        addressee: item.addressee || { user_id: item.addressee_id, display_name: null, avatar_url: null }
      }));
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // 3. Outgoing (Sent) Requests
  const { data: outgoingRequests = [], isPending: loadingOutgoing, error: outgoingError } = useQuery({
    queryKey: ['friendRequests', 'outgoing', userId],
    queryFn: async (): Promise<Friendship[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id, requester_id, addressee_id, status, created_at, 
          requester:profiles!requester_id(user_id, display_name, avatar_url), 
          addressee:profiles!addressee_id(user_id, display_name, avatar_url)
        `)
        .eq('requester_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        status: item.status as 'pending' | 'accepted' | 'declined',
        requester: item.requester || { user_id: item.requester_id, display_name: null, avatar_url: null },
        addressee: item.addressee || { user_id: item.addressee_id, display_name: null, avatar_url: null }
      }));
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // 4. Contacts (Manually added)
  const { data: contacts = [], isPending: loadingContacts, error: contactsError } = useQuery({
    queryKey: ['contacts', userId],
    queryFn: async (): Promise<Contact[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // 5. Nearby Users (Location-based suggestions)
  const { data: nearbyUsers = [], isPending: loadingNearby, error: nearbyError } = useQuery({
    queryKey: ['nearbyUsers', userId, userLocation?.lat, userLocation?.lng],
    queryFn: async (): Promise<NearbyProfile[]> => {
      if (!userId || !userLocation) return [];
      
      // Get all existing friendships to exclude
      const { data: allFriendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      
      const excludeIds = new Set<string>([userId]);
      allFriendships?.forEach(f => {
        excludeIds.add(f.requester_id);
        excludeIds.add(f.addressee_id);
      });

      // Use the database function for nearby users
      const { data, error } = await supabase.rpc('get_nearby_users', {
        p_user_id: userId,
        p_radius_km: NEARBY_RADIUS_KM
      });

      if (error) {
        console.error('Nearby users error:', error);
        // Fallback: Get users with location who aren't friends
        const { data: fallbackUsers } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, latitude, longitude')
          .not('user_id', 'in', `(${Array.from(excludeIds).join(',')})`)
          .not('latitude', 'is', null)
          .limit(20);
        
        return (fallbackUsers || []).map(u => ({
          user_id: u.user_id,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          latitude: u.latitude,
          longitude: u.longitude
        }));
      }

      // Filter out already connected users
      return (data || []).filter((u: any) => !excludeIds.has(u.user_id)).map((u: any) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        distance_km: u.distance_km
      }));
    },
    enabled: activeTab === 'discover' && discoverView === 'nearby' && !!userId && !!userLocation,
    staleTime: 60000,
  });

  // ============ REAL-TIME SUBSCRIPTIONS ============

  // Real-time updates for friend requests
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('friend-requests-realtime')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'friendships',
          filter: `addressee_id=eq.${userId}`
        },
        (payload) => {
          console.log('Friend request change:', payload);
          queryClient.invalidateQueries({ queryKey: ['friendRequests', 'incoming', userId] });
          queryClient.invalidateQueries({ queryKey: ['friends', userId] });
          
          if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
            toast.info('New friend request received!');
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'friendships',
          filter: `requester_id=eq.${userId}`
        },
        (payload) => {
          console.log('Outgoing request change:', payload);
          queryClient.invalidateQueries({ queryKey: ['friendRequests', 'outgoing', userId] });
          queryClient.invalidateQueries({ queryKey: ['friends', userId] });
          
          if (payload.eventType === 'UPDATE' && payload.new.status === 'accepted') {
            toast.success('Your friend request was accepted!');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Handle query errors
  useEffect(() => {
    if (friendsError) toast.error('Failed to load friends');
    if (incomingError) toast.error('Failed to load incoming requests');
    if (outgoingError) toast.error('Failed to load sent requests');
    if (contactsError) toast.error('Failed to load contacts');
    if (nearbyError) toast.error('Failed to load nearby users');
  }, [friendsError, incomingError, outgoingError, contactsError, nearbyError]);

  // ============ MUTATIONS ============
  
  const sendFriendRequest = useMutation({
    mutationFn: async (targetProfile: Profile) => {
      if (!userId) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetProfile.user_id}),and(requester_id.eq.${targetProfile.user_id},addressee_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') throw new Error("Already friends!");
        if (existing.status === 'pending') throw new Error("Request already pending.");
      }

      const { data, error } = await supabase
        .from('friendships')
        .insert({ requester_id: userId, addressee_id: targetProfile.user_id, status: 'pending' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success('Friend request sent');
      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      await queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send request");
    }
  });

  const acceptFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Friend added!');
      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      await queryClient.invalidateQueries({ queryKey: ['friends'] });
      await queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to accept request')
  });

  const rejectFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request declined');
      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to decline request')
  });

  const cancelSentRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request cancelled');
      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      await queryClient.invalidateQueries({ queryKey: ['nearbyUsers'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to cancel request')
  });

  const addContact = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      if (!newContactName.trim()) throw new Error("Name is required");

      const name = newContactName.trim();
      const email = newContactEmail.trim().toLowerCase();

      // Check if user exists on platform
      if (email) {
        const { data: existingUsers } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, email')
          .neq('user_id', userId)
          .eq('email', email);

        if (existingUsers && existingUsers.length > 0) {
          const foundUser = existingUsers[0];
          
          const { data: relationship } = await supabase
            .from('friendships')
            .select('status')
            .or(`and(requester_id.eq.${userId},addressee_id.eq.${foundUser.user_id}),and(requester_id.eq.${foundUser.user_id},addressee_id.eq.${userId})`)
            .maybeSingle();

          if (relationship?.status === 'accepted') return { status: 'already_friends', user: foundUser };
          if (relationship?.status === 'pending') return { status: 'pending_exists', user: foundUser };

          await supabase.from('friendships').insert({ requester_id: userId, addressee_id: foundUser.user_id, status: 'pending' });
          return { status: 'request_sent', user: foundUser };
        }
      }

      // Save as contact (not on platform)
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: name,
          email: email || null,
          phone: newContactPhone.trim() || null,
          is_app_user: false
        })
        .select()
        .single();

      if (error) throw error;
      return { status: 'contact_saved', data };
    },
    onSuccess: async (result: any) => {
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setShowAddContact(false);

      if (result.status === 'request_sent') {
        toast.success(`User found! Friend request sent to ${result.user.display_name}.`);
        await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
        setActiveTab('requests');
        setRequestView('sent');
      } else if (result.status === 'already_friends') {
        toast.info(`Already friends with ${result.user.display_name}!`);
      } else if (result.status === 'pending_exists') {
        toast.info(`Request already pending for ${result.user.display_name}.`);
      } else {
        toast.success('Contact saved. Invite them to join!');
        await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      }
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to add contact')
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Contact removed');
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to remove contact')
  });

  const inviteContact = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!userId) throw new Error("Not authenticated");

      // Update invited timestamp
      await supabase
        .from('contacts')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', contact.id);

      const appName = "Lynq";
      const inviteLink = "https://lynq.app/join";
      const message = `Hey ${contact.name.split(' ')[0]}, join me on ${appName}! Download here: ${inviteLink}`;
      
      if (contact.phone) {
        const cleanPhone = sanitizePhone(contact.phone);
        const separator = /iphone|ipad|ipod/i.test(navigator.userAgent) ? '&' : '?';
        window.location.href = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
      } else if (contact.email) {
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Join me on " + appName)}&body=${encodeURIComponent(message)}`;
      }
      
      return contact;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to invite contact')
  });

  // ============ RENDER HELPERS ============

  const renderProfile = useCallback((profile: Profile | NearbyProfile, subtext?: string) => (
    <>
      <Avatar className="w-12 h-12 border border-border/50">
        <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground">
          {profile.display_name?.[0]?.toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate">{profile.display_name || 'Unknown User'}</div>
        <div className="text-xs text-muted-foreground">
          {'distance_km' in profile && profile.distance_km !== undefined ? (
            <span className="flex items-center gap-1 text-green-600">
              <MapPin className="w-3 h-3" />
              {profile.distance_km < 1 ? `${Math.round(profile.distance_km * 1000)}m away` : `${profile.distance_km.toFixed(1)}km away`}
            </span>
          ) : subtext}
        </div>
      </div>
    </>
  ), []);

  const renderContact = useCallback((contact: Contact) => (
    <>
      <Avatar className="w-12 h-12 border border-border/50">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
          {contact.name[0]?.toUpperCase() || 'C'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate">{contact.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {contact.email || contact.phone || 'No contact info'}
        </div>
      </div>
    </>
  ), []);

  // ============ FILTERED DATA ============

  const filteredFriends = useMemo(() => {
    let res = [...friends];
    if (debouncedSearch) {
      res = res.filter(f => {
        const p = f.requester_id === userId ? f.addressee : f.requester;
        return p.display_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
      });
    }
    res.sort((a, b) => {
      const pA = a.requester_id === userId ? a.addressee : a.requester;
      const pB = b.requester_id === userId ? b.addressee : b.requester;
      return sortOption === 'alphabetical' 
        ? (pA.display_name || '').localeCompare(pB.display_name || '') 
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return res;
  }, [friends, debouncedSearch, sortOption, userId]);

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch) return contacts;
    return contacts.filter(c => 
      c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [contacts, debouncedSearch]);

  // ============ RENDER ============

  return (
    <div className="container-mobile py-4 space-y-4 min-h-[80vh] pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
      </div>
      
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

        {/* ============ FRIENDS TAB ============ */}
        <TabsContent value="friends" className="mt-4 space-y-2">
          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="p-0">
              {loadingFriends ? (
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
                    const p = f.requester_id === userId ? f.addressee : f.requester;
                    return (
                      <div 
                        key={f.id} 
                        className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-accent/5 transition-colors cursor-pointer" 
                        onClick={() => navigate(`/messages?userId=${p.user_id}`)}
                      >
                        {renderProfile(p, "Connected")}
                        <Button variant="ghost" size="icon" onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/messages?userId=${p.user_id}`);
                        }}>
                          <MessageSquare className="w-5 h-5 text-primary" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ REQUESTS TAB ============ */}
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
              {loadingIncoming ? (
                <FriendSkeleton />
              ) : incomingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No pending requests</div>
              ) : (
                incomingRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-amber-200 dark:border-amber-900">
                    {renderProfile(r.requester)}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:bg-red-50" onClick={() => rejectFriendRequest.mutate(r.id)} disabled={rejectFriendRequest.isPending}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="h-8" onClick={() => acceptFriendRequest.mutate(r.id)} disabled={acceptFriendRequest.isPending}>
                          {acceptFriendRequest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {requestView === 'sent' && (
            <div className="space-y-2">
              {loadingOutgoing ? (
                <FriendSkeleton />
              ) : outgoingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No sent requests</div>
              ) : (
                outgoingRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-blue-200 dark:border-blue-900">
                    {renderProfile(r.addressee)}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                      <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => cancelSentRequest.mutate(r.id)} disabled={cancelSentRequest.isPending}>
                        {cancelSentRequest.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* ============ DISCOVER TAB ============ */}
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
            <div className="space-y-2">
              {!userLocation ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <MapPin className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">Enable location to see nearby people</p>
                    <Button variant="outline" className="mt-3" onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => toast.error('Location access denied')
                      );
                    }}>
                      <MapPin className="w-4 h-4 mr-2" /> Enable Location
                    </Button>
                  </CardContent>
                </Card>
              ) : loadingNearby ? (
                <FriendSkeleton />
              ) : nearbyUsers.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No one nearby yet</p>
                  <p className="text-xs mt-1">Invite friends to join!</p>
                </div>
              ) : (
                nearbyUsers.map(p => (
                  <div key={p.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                    {renderProfile(p)}
                    <Button 
                      size="sm" 
                      className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                      disabled={sendFriendRequest.isPending}
                      onClick={() => sendFriendRequest.mutate(p)}
                    >
                      {sendFriendRequest.isPending && sendFriendRequest.variables?.user_id === p.user_id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4 mr-1" />
                      )}
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* CONTACTS VIEW */}
          {discoverView === 'contacts' && (
            <div className="space-y-3">
              {/* Add Contact Form */}
              {showAddContact ? (
                <Card className="border-2 border-primary/20 bg-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">Add New Contact</h3>
                      <Button variant="ghost" size="sm" onClick={() => { setShowAddContact(false); setNewContactName(""); setNewContactEmail(""); setNewContactPhone(""); }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input placeholder="Full Name *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="bg-background" />
                    <Input type="email" placeholder="Email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} className="bg-background" />
                    <Input type="tel" placeholder="Phone Number" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="bg-background" />
                    <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white" onClick={() => addContact.mutate()} disabled={addContact.isPending || !newContactName.trim()}>
                      {addContact.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <User className="w-4 h-4 mr-2" />}
                      Save / Connect
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white" onClick={() => setShowAddContact(true)}>
                  <User className="w-4 h-4 mr-2" /> Add New Contact
                </Button>
              )}

              {/* Contacts List */}
              {loadingContacts ? (
                <FriendSkeleton />
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No contacts match your search' : !showAddContact && 'No contacts yet. Add someone to invite them!'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => {
                    const invitedRecently = wasInvitedRecently(contact.invited_at);
                    const isOnPlatform = contact.is_app_user || contact.matched_user_id;
                    
                    return (
                      <div key={contact.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                        {renderContact(contact)}
                        <div className="flex gap-1">
                          {!isOnPlatform && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className={`text-xs h-8 ${invitedRecently ? 'text-green-600 border-green-300' : ''}`}
                              onClick={() => inviteContact.mutate(contact)}
                              disabled={inviteContact.isPending || (!contact.email && !contact.phone)}
                            >
                              {inviteContact.isPending && inviteContact.variables?.id === contact.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : invitedRecently ? (
                                <Check className="w-3 h-3 mr-1" />
                              ) : (
                                <Send className="w-3 h-3 mr-1" />
                              )}
                              {invitedRecently ? 'Invited' : 'Invite'}
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="text-xs h-8 text-red-500 hover:bg-red-50"
                            onClick={() => deleteContact.mutate(contact.id)}
                            disabled={deleteContact.isPending}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Info Card */}
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
    </div>
  );
}
