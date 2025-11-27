import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, MessageSquare, UserPlus, Check, X, Filter, ArrowUpDown, Clock, Loader2, Send, Mail, User, Phone
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- UTILS ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Helper to trigger SMS
const triggerSmsInvite = (contact: Contact) => {
  const appName = "Lynq"; 
  const inviteLink = "https://lynq.app/join"; // Replace with actual link
  const message = `Hey ${contact.name.split(' ')[0]}, join me on ${appName}! Download here: ${inviteLink}`;
  
  if (contact.phone) {
    const cleanPhone = contact.phone.replace(/\D/g, ''); 
    const ua = navigator.userAgent.toLowerCase();
    const isiOS = /iphone|ipad|ipod/.test(ua);
    const separator = isiOS ? '&' : '?';
    window.location.href = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
    toast.success("Opening SMS app...");
  } else if (contact.email) {
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Join me on " + appName)}&body=${encodeURIComponent(message)}`;
    toast.success("Opening Mail app...");
  } else {
    toast.error("No contact details available for invite.");
  }
};

// --- TYPES ---
type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
  phone?: string;
};

type SuggestionProfile = Profile & {
  reason?: string;
  score?: number;
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
};

type SortOption = 'newest' | 'alphabetical';

// --- SKELETON ---
const FriendSkeleton = () => (
  <div className="space-y-3">
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
  const debouncedSearch = useDebounce(search, 500);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [activeTab, setActiveTab] = useState("all");
  const [requestView, setRequestView] = useState<'received' | 'sent'>('received');
  const [discoverView, setDiscoverView] = useState<'suggestions' | 'contacts'>('suggestions');
  
  // Contact form state
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // Local state for immediate UI updates
  const [recentlySent, setRecentlySent] = useState<Set<string>>(new Set());

  // --- QUERIES ---

  const { data: friends = [], isPending: loadingFriends, refetch: refetchFriends } = useQuery<Friendship[]>({
    queryKey: ['friends', userId],
    queryFn: async () => {
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
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const { data: incomingRequests = [], isPending: loadingIncoming, refetch: refetchIncoming } = useQuery<Friendship[]>({
    queryKey: ['friendRequests', 'incoming', userId],
    queryFn: async () => {
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
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const { data: outgoingRequests = [], isPending: loadingOutgoing, refetch: refetchOutgoing } = useQuery<Friendship[]>({
    queryKey: ['friendRequests', 'outgoing', userId],
    queryFn: async () => {
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
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  const { data: contacts = [], isPending: loadingContacts, refetch: refetchContacts } = useQuery<Contact[]>({
    queryKey: ['contacts', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // Source of truth for UI buttons
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach(f => {
      const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      ids.add(friendId);
    });
    incomingRequests.forEach(r => ids.add(r.requester_id));
    outgoingRequests.forEach(r => ids.add(r.addressee_id));
    
    // Add locally sent IDs to update UI immediately
    recentlySent.forEach(id => ids.add(id));
    
    if (userId) ids.add(userId);
    return ids;
  }, [friends, incomingRequests, outgoingRequests, userId, recentlySent]);


  // Suggestions Logic
  const { data: suggestions = [], isPending: loadingSuggestions } = useQuery<SuggestionProfile[]>({
    queryKey: ['suggestions', userId, debouncedSearch, existingIds.size, friends.length, contacts.length],
    queryFn: async () => {
      if (!userId) return [];
      
      const suggestionsMap = new Map<string, SuggestionProfile>();
      const excludeIds = Array.from(existingIds);

      // A: Contacts Match
      if (contacts.length > 0) {
        const contactEmails = contacts.map(c => c.email).filter(Boolean) as string[];
        const contactPhones = contacts.map(c => c.phone?.replace(/\D/g, '')).filter(Boolean) as string[];

        if (contactEmails.length > 0 || contactPhones.length > 0) {
          let matchQuery = supabase.from('profiles').select('user_id, display_name, avatar_url, email, phone');
          const conditions = [];
          if (contactEmails.length) conditions.push(`email.in.(${contactEmails.map(e => `"${e}"`).join(',')})`);
          if (contactPhones.length) conditions.push(`phone.in.(${contactPhones.map(p => `"${p}"`).join(',')})`); 

          if (conditions.length > 0) {
            matchQuery = matchQuery.or(conditions.join(','));
            const { data: matches } = await matchQuery;
            matches?.forEach(p => {
              if (p.user_id !== userId && !excludeIds.includes(p.user_id)) {
                suggestionsMap.set(p.user_id, { 
                  user_id: p.user_id, 
                  display_name: p.display_name, 
                  avatar_url: p.avatar_url, 
                  score: 100, 
                  reason: 'From your contacts' 
                });
              }
            });
          }
        }
      }

      // B: Mutuals
      const myFriendIds = friends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
      if (myFriendIds.length > 0) {
        const recentFriendIds = myFriendIds.slice(0, 20);
        const { data: mutualsData } = await supabase
          .from('friendships')
          .select(`
            requester_id, addressee_id,
            requester:profiles!requester_id(user_id, display_name, avatar_url),
            addressee:profiles!addressee_id(user_id, display_name, avatar_url)
          `)
          .or(`requester_id.in.(${recentFriendIds.join(',')}),addressee_id.in.(${recentFriendIds.join(',')})`)
          .eq('status', 'accepted')
          .limit(50);

        mutualsData?.forEach(m => {
          let potentialId = myFriendIds.includes(m.requester_id) ? m.addressee_id : m.requester_id;
          let potential = myFriendIds.includes(m.requester_id) ? m.addressee : m.requester;

          if (potentialId && potentialId !== userId && !excludeIds.includes(potentialId)) {
             const existing = suggestionsMap.get(potentialId);
             let currentScore = existing?.score || 0;
             let mutualCount = 0;
             if (existing && existing.reason?.includes('mutual')) {
                const match = existing.reason.match(/(\d+)/);
                if (match) mutualCount = parseInt(match[0]);
             }
             const newCount = mutualCount + 1;
             suggestionsMap.set(potentialId, { 
               user_id: potential.user_id,
               display_name: potential.display_name,
               avatar_url: potential.avatar_url,
               score: currentScore + 20,
               reason: `${newCount} mutual friend${newCount > 1 ? 's' : ''}` 
             });
          }
        });
      }

      // C: Discovery
      if (suggestionsMap.size < 20) {
         let discoveryQuery = supabase.from('profiles').select('user_id, display_name, avatar_url');
         if (debouncedSearch) discoveryQuery = discoveryQuery.ilike('display_name', `%${debouncedSearch}%`);
         
         const allExclusions = [...excludeIds, ...Array.from(suggestionsMap.keys())];
         if (allExclusions.length > 0) {
             discoveryQuery = discoveryQuery.not('user_id', 'in', `(${allExclusions.join(',')})`);
         }

         const { data: randomUsers } = await discoveryQuery.limit(20 - suggestionsMap.size);
         randomUsers?.forEach(p => {
            suggestionsMap.set(p.user_id, { ...p, score: 1, reason: 'Suggested for you' });
         });
      }

      return Array.from(suggestionsMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    },
    enabled: activeTab === 'discover' && discoverView === 'suggestions',
    staleTime: 60000, 
  });


  // --- MUTATIONS ---
  
  const sendFriendRequest = useMutation({
    mutationFn: async (targetProfile: Profile) => {
      if (!userId) throw new Error("Not authenticated");

      // Check existing
      const { data: existing } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetProfile.user_id}),and(requester_id.eq.${targetProfile.user_id},addressee_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') throw new Error("ALREADY_FRIENDS");
        if (existing.status === 'pending') throw new Error("ALREADY_PENDING");
      }

      const { data, error } = await supabase
        .from('friendships')
        .insert({ 
          requester_id: userId, 
          addressee_id: targetProfile.user_id, 
          status: 'pending' 
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: targetProfile.user_id,
        type: 'friend_request',
        title: 'New Friend Request',
        content: `You have a new friend request.`,
        data: { requester_id: userId },
      }).catch(console.warn);
      
      return data;
    },
    onSuccess: async (_, variables) => {
      toast.success('Friend request sent');
      setRecentlySent(prev => new Set(prev).add(variables.user_id));
      await Promise.all([
        refetchOutgoing(),
        queryClient.invalidateQueries({ queryKey: ['suggestions'] }),
      ]);
    },
    onError: (error: any, variables) => {
      // FIX: Handle "Already Pending" gracefully to fix button state
      if (error.message === "ALREADY_PENDING" || error.message.includes("pending")) {
        // If it's already pending, just update the UI to match reality
        setRecentlySent(prev => new Set(prev).add(variables.user_id));
        toast.info("Request already pending."); 
      } else if (error.message === "ALREADY_FRIENDS") {
        toast.info("You are already friends!");
      } else {
        toast.error(error.message || "Failed to send request");
      }
    }
  });

  const acceptFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Friend added!');
      await Promise.all([refetchFriends(), refetchIncoming()]);
    },
    onError: (error: any) => toast.error(error.message)
  });

  const rejectFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request declined');
      await refetchIncoming();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const cancelSentRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request cancelled');
      await refetchOutgoing();
    },
    onError: (error: any) => toast.error(error.message)
  });

  // Contact Add (Manual Entry)
  const addContact = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      if (!newContactName.trim()) throw new Error("Name is required");

      const name = newContactName.trim();
      const email = newContactEmail.trim().toLowerCase();
      const phoneRaw = newContactPhone.trim();
      
      // Attempt search immediately when adding contact
      let query = supabase.from('profiles').select('*').neq('user_id', userId);
      const conditions: string[] = [];
      if (name) conditions.push(`display_name.ilike.${name}`);
      if (email) conditions.push(`email.eq.${email}`);
      if (phoneRaw) conditions.push(`phone.eq.${phoneRaw}`);

      let foundUser = null;
      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
        const { data: matches } = await query;
        if (matches && matches.length > 0) foundUser = matches[0];
      }

      // Save Contact
      if (!email && !phoneRaw && !foundUser) {
         throw new Error(`User "${name}" not found. Please provide email/phone to invite.`);
      }

      const { data: savedContact, error } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: name,
          email: email || null,
          phone: phoneRaw || null,
        })
        .select()
        .single();

      if (error) throw error;
      return { contact: savedContact, foundUser };
    },
    onSuccess: async (result) => {
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setShowAddContact(false);
      await refetchContacts();

      if (result.foundUser) {
        // Automatically send request if user found during add
        sendFriendRequest.mutate(result.foundUser);
        toast.success(`User found! Request sent to ${result.foundUser.display_name}.`);
      } else {
        toast.success('Contact saved. You can now invite them.');
      }
    },
    onError: (error: any) => toast.error(error.message)
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Contact removed');
      await refetchContacts();
    },
    onError: (error: any) => toast.error(error.message)
  });

  // NEW: Smart Contact Action (Search -> Add OR Invite)
  const handleContactAction = useMutation({
    mutationFn: async (contact: Contact) => {
        if (!userId) throw new Error("Not authenticated");

        // 1. Search for User
        let query = supabase.from('profiles').select('*').neq('user_id', userId);
        const conditions: string[] = [];
        if (contact.email) conditions.push(`email.eq.${contact.email}`);
        if (contact.phone) {
             const cleanPhone = contact.phone.replace(/\D/g, '');
             conditions.push(`phone.eq.${cleanPhone}`);
             conditions.push(`phone.eq.${contact.phone}`);
        }

        if (conditions.length === 0) return { type: 'invite', contact }; // No searchable info

        query = query.or(conditions.join(','));
        const { data: matches } = await query;

        if (matches && matches.length > 0) {
            return { type: 'found', profile: matches[0], contact };
        } else {
            return { type: 'invite', contact };
        }
    },
    onSuccess: (result) => {
        if (result.type === 'found' && result.profile) {
            // User exists -> Add Friend
            sendFriendRequest.mutate(result.profile);
        } else {
            // User not found -> Trigger SMS/Mail Invite
            triggerSmsInvite(result.contact);
            
            // Optional: Update invited_at timestamp
            if (result.contact.id) {
                supabase.from('contacts')
                  .update({ invited_at: new Date().toISOString() })
                  .eq('id', result.contact.id)
                  .then(() => refetchContacts());
            }
        }
    },
    onError: (error: any) => toast.error(error.message)
  });

  // Render Helpers
  const renderProfile = useCallback((profile: SuggestionProfile, subtext?: string) => (
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
          {profile.reason ? (
             <span className={profile.score && profile.score > 50 ? "text-blue-600 font-medium" : ""}>
               {profile.reason}
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
      c.email?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.phone?.includes(debouncedSearch)
    );
  }, [contacts, debouncedSearch]);

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
            placeholder="Search friends..."
            className="pl-10 bg-background/50 backdrop-blur-sm"
          />
          {search !== debouncedSearch && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/30 p-1 rounded-xl">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            Requests
            {incomingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {incomingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-2">
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
              {loadingIncoming ? <FriendSkeleton /> : incomingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No incoming requests</div>
              ) : (
                incomingRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                    {renderProfile(r.requester, "Wants to connect")}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => rejectFriendRequest.mutate(r.id)}>
                        <X className="w-5 h-5" />
                      </Button>
                      <Button size="icon" className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full" onClick={() => acceptFriendRequest.mutate(r.id)}>
                        {acceptFriendRequest.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {requestView === 'sent' && (
            <div className="space-y-2">
              {loadingOutgoing ? <FriendSkeleton /> : outgoingRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No sent requests</div>
              ) : (
                outgoingRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 opacity-80">
                    {renderProfile(r.addressee, "Request sent")}
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => cancelSentRequest.mutate(r.id)}>
                      {cancelSentRequest.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Cancel
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="discover" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button 
              onClick={() => setDiscoverView('suggestions')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                discoverView === 'suggestions' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Suggestions
            </button>
            <button 
              onClick={() => setDiscoverView('contacts')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                discoverView === 'contacts' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              My Contacts {contacts.length > 0 && `(${contacts.length})`}
            </button>
          </div>

          {discoverView === 'suggestions' && (
            <div className="space-y-2">
              {loadingSuggestions ? <FriendSkeleton /> : suggestions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">{search ? 'No users found' : 'No suggestions available'}</div>
              ) : (
                suggestions.map(p => {
                  const isPending = existingIds.has(p.user_id);
                  return (
                    <div key={p.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                      {renderProfile(p, "Suggested for you")}
                      <Button 
                        size="sm" 
                        className={isPending 
                          ? "bg-transparent border border-primary/20 text-muted-foreground cursor-not-allowed" 
                          : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                        }
                        variant={isPending ? "outline" : "default"}
                        disabled={isPending || sendFriendRequest.isPending}
                        onClick={() => !isPending && sendFriendRequest.mutate(p)}
                      >
                        {sendFriendRequest.isPending && sendFriendRequest.variables?.user_id === p.user_id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : isPending ? (
                          <Clock className="w-4 h-4 mr-1" />
                        ) : (
                          <UserPlus className="w-4 h-4 mr-1" />
                        )}
                        {isPending ? 'Pending' : 'Add'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {discoverView === 'contacts' && (
            <div className="space-y-3">
              {showAddContact ? (
                <Card className="border-2 border-primary/20 bg-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">Add New Contact</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowAddContact(false)}><X className="w-4 h-4" /></Button>
                    </div>
                    <Input placeholder="Full Name *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} className="bg-background" />
                    <Input type="email" placeholder="Email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} className="bg-background" />
                    <Input type="tel" placeholder="Phone Number" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} className="bg-background" />
                    <Button
                      className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                      onClick={() => addContact.mutate()}
                      disabled={addContact.isPending || !newContactName.trim()}
                    >
                      {addContact.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save / Connect
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white" onClick={() => setShowAddContact(true)}>
                  <User className="w-4 h-4 mr-2" /> Add New Contact
                </Button>
              )}

              {loadingContacts ? <FriendSkeleton /> : filteredContacts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No contacts match' : showAddContact ? '' : 'No contacts yet. Add someone to invite them!'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => {
                    const wasInvited = !!contact.invited_at;
                    return (
                      <div key={contact.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                        {renderContact(contact)}
                        <div className="flex gap-1">
                          {/* SMART ADD BUTTON: Searches, then Adds OR Invites */}
                          <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8"
                              onClick={() => handleContactAction.mutate(contact)}
                              disabled={handleContactAction.isPending || (!contact.email && !contact.phone)}
                            >
                              {handleContactAction.isPending && handleContactAction.variables?.id === contact.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : wasInvited ? (
                                <Send className="w-3 h-3 mr-1" />
                              ) : (
                                <UserPlus className="w-3 h-3 mr-1" />
                              )}
                              {wasInvited ? 'Invited' : 'Add'}
                            </Button>
                          
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}