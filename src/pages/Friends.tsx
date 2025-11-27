import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, MessageSquare, UserPlus, Check, X, Filter, ArrowUpDown, Clock, Loader2, Send, Mail, User
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

// --- TYPES ---
type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
  phone?: string;
};

// Extended type for suggestions to include the "reason" (e.g. "Mutual friend")
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

  // Fix: Local state to track sent requests immediately for instant UI feedback
  const [recentlySent, setRecentlySent] = useState<Set<string>>(new Set());

  // --- QUERIES ---

  // 1. Friends (Accepted)
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

  // 2. Incoming (Received)
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

  // 3. Outgoing (Sent)
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

  // 5. Contacts (Moved up because Suggestions needs it)
  const { data: contacts = [], isPending: loadingContacts, refetch: refetchContacts } = useQuery<Contact[]>({
    queryKey: ['contacts', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching contacts:', error);
        return [];
      }
      
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // Helper: Source of truth for UI buttons
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach(f => {
      const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      ids.add(friendId);
    });
    incomingRequests.forEach(r => ids.add(r.requester_id));
    outgoingRequests.forEach(r => ids.add(r.addressee_id));
    
    // Add recently sent IDs to ensure button state updates instantly
    recentlySent.forEach(id => ids.add(id));
    
    if (userId) ids.add(userId);
    return ids;
  }, [friends, incomingRequests, outgoingRequests, userId, recentlySent]);


  // 4. Suggestions (SMART LOGIC: Mutuals + Contact Matches)
  const { data: suggestions = [], isPending: loadingSuggestions } = useQuery<SuggestionProfile[]>({
    queryKey: ['suggestions', userId, debouncedSearch, existingIds.size, friends.length, contacts.length],
    queryFn: async () => {
      if (!userId) return [];
      
      const suggestionsMap = new Map<string, SuggestionProfile>();
      const excludeIds = Array.from(existingIds);

      // --- STRATEGY A: MATCH CONTACTS (High Priority) ---
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

      // --- STRATEGY B: MUTUAL FRIENDS (Medium Priority) ---
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
          let potential: any = null;
          let potentialId = '';

          if (myFriendIds.includes(m.requester_id)) {
            potential = m.addressee;
            potentialId = m.addressee_id;
          } else {
            potential = m.requester;
            potentialId = m.requester_id;
          }

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

      // --- STRATEGY C: DISCOVERY (Fallback) ---
      if (suggestionsMap.size < 20) {
         let discoveryQuery = supabase.from('profiles').select('user_id, display_name, avatar_url');
         
         if (debouncedSearch) {
             discoveryQuery = discoveryQuery.ilike('display_name', `%${debouncedSearch}%`);
         }
         
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

      // Robust check for existing relationship in both directions
      const { data: existing } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetProfile.user_id}),and(requester_id.eq.${targetProfile.user_id},addressee_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') throw new Error("You are already friends!");
        if (existing.status === 'pending') throw new Error("Friend request already pending.");
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

      // Safe notification dispatch
      try {
        await supabase.from('notifications').insert({
          user_id: targetProfile.user_id,
          type: 'friend_request',
          title: 'New Friend Request',
          content: `You have a new friend request.`,
          data: { requester_id: userId },
        });
      } catch (e) {
        console.warn("Failed to send notification:", e);
      }
      
      return data;
    },
    onSuccess: async (_, variables) => {
      toast.success('Friend request sent');
      
      // Update local state instantly so UI disables button immediately
      setRecentlySent(prev => new Set(prev).add(variables.user_id));

      await Promise.all([
        refetchOutgoing(),
        queryClient.invalidateQueries({ queryKey: ['suggestions'] }),
      ]);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to send request";
      // If it was already pending but our UI was out of sync, just toast info
      if (message.includes("already pending")) {
        toast.info("Friend request already pending.");
        // Force sync
        refetchOutgoing();
      } else {
        toast.error(message);
      }
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
      await Promise.all([
        refetchFriends(),
        refetchIncoming(),
      ]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to accept request');
    }
  });

  const rejectFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request declined');
      await refetchIncoming();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to decline request');
    }
  });

  const cancelSentRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Request cancelled');
      await refetchOutgoing();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel request');
    }
  });

  // Contact Mutations
  const addContact = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      
      if (!newContactName.trim()) throw new Error("Name is required");

      const name = newContactName.trim();
      const email = newContactEmail.trim().toLowerCase();
      const phoneRaw = newContactPhone.trim();
      
      // Search Logic
      let query = supabase.from('profiles').select('user_id, display_name, avatar_url, email, phone')
        .neq('user_id', userId); 
      
      const conditions: string[] = [];
      if (name) conditions.push(`display_name.ilike.${name}`);
      if (email) conditions.push(`email.eq.${email}`);
      if (phoneRaw) conditions.push(`phone.eq.${phoneRaw}`);

      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
        const { data: existingUsers, error: searchError } = await query;
        
        if (searchError) console.error("Search Error:", searchError);

        if (existingUsers && existingUsers.length > 0) {
           const foundUser = existingUsers[0];
           
           const { data: relationship } = await supabase
             .from('friendships')
             .select('status')
             .or(`and(requester_id.eq.${userId},addressee_id.eq.${foundUser.user_id}),and(requester_id.eq.${foundUser.user_id},addressee_id.eq.${userId})`)
             .maybeSingle();

           if (relationship) {
             if (relationship.status === 'accepted') {
                return { status: 'already_friends', user: foundUser };
             } else {
                return { status: 'pending_exists', user: foundUser };
             }
           } else {
             const { error: reqError } = await supabase.from('friendships').insert({
               requester_id: userId,
               addressee_id: foundUser.user_id,
               status: 'pending' 
             });
             
             if (reqError) throw reqError;
             
             // Optimistic update handled in onSuccess
             
             await supabase.from('notifications').insert({
                user_id: foundUser.user_id,
                type: 'friend_request',
                title: 'New Friend Request',
                content: `You have a new friend request from ${user?.email || 'a user'}.`,
                data: { requester_id: userId },
                is_read: false
             });

             return { status: 'request_sent', user: foundUser };
           }
        }
      }

      if (!email && !phoneRaw) {
        throw new Error(`User "${name}" not found on the app. Please add email or phone to save as a contact.`);
      }

      if (email) {
        const { data: existingByEmail } = await supabase.from('contacts').select('id, name').eq('user_id', userId).eq('email', email).maybeSingle();
        if (existingByEmail) throw new Error(`Contact with this email already exists: ${existingByEmail.name}`);
      }

      const { data, error } = await supabase
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
      return { status: 'contact_saved', data };
    },
    onSuccess: async (result: any) => {
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setShowAddContact(false);

      if (result.status === 'request_sent') {
        toast.success(`User found! Friend request sent to ${result.user.display_name}.`);
        setRecentlySent(prev => new Set(prev).add(result.user.user_id));
        await Promise.all([
            refetchOutgoing(), 
            queryClient.invalidateQueries({ queryKey: ['suggestions'] })
        ]);
        setActiveTab('requests');
        setRequestView('sent');
      } else if (result.status === 'already_friends') {
        toast.info(`You are already friends with ${result.user.display_name}!`);
      } else if (result.status === 'pending_exists') {
        toast.info(`A request is already pending for ${result.user.display_name}.`);
      } else {
        toast.success('User not on app. Saved to contacts list.');
        await refetchContacts();
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process contact');
    }
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId)
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.info('Contact removed');
      await refetchContacts();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove contact');
    }
  });

  // NEW: Manual connect from Contact List Item (Replaces SMS Invite)
  const connectToContact = useMutation({
    mutationFn: async (contact: Contact) => {
        if (!userId) throw new Error("Not authenticated");

        // Try to find the user by Email or Phone
        let query = supabase.from('profiles').select('*').neq('user_id', userId);
        
        const conditions: string[] = [];
        if (contact.email) conditions.push(`email.eq.${contact.email}`);
        if (contact.phone) {
             const cleanPhone = contact.phone.replace(/\D/g, '');
             conditions.push(`phone.eq.${cleanPhone}`); // Note: requires clean phone in DB to match
             conditions.push(`phone.eq.${contact.phone}`); // Try exact match too
        }

        if (conditions.length === 0) throw new Error("This contact has no email or phone to search for.");

        query = query.or(conditions.join(','));
        const { data: matches } = await query;

        if (matches && matches.length > 0) {
            return matches[0]; // Return the profile found
        } else {
            throw new Error("User not found on the app.");
        }
    },
    onSuccess: (profile) => {
        // If user found, trigger friend request
        sendFriendRequest.mutate(profile);
    },
    onError: (error: any) => {
        if (error.message === "User not found on the app.") {
             toast.info("User not found on the app yet.");
        } else {
             toast.error(error.message);
        }
    }
  });

  // Render Profile Helper
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

  // Render Contact Helper
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

  // Filter and sort friends
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

  // Filter contacts
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

        {/* ALL FRIENDS */}
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
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('discover')}
                    className="mt-2"
                  >
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

        {/* REQUESTS */}
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
                <div className="text-center py-10 text-muted-foreground">
                  No incoming requests
                </div>
              ) : (
                incomingRequests.map(r => (
                  <div 
                    key={r.id} 
                    className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40"
                  >
                    {renderProfile(r.requester, "Wants to connect")}
                    <div className="flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-red-500 hover:bg-red-50 hover:text-red-600" 
                        onClick={() => rejectFriendRequest.mutate(r.id)}
                        disabled={rejectFriendRequest.isPending}
                      >
                        <X className="w-5 h-5" />
                      </Button>
                      <Button 
                        size="icon" 
                        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full hover:from-blue-600 hover:to-purple-600" 
                        onClick={() => acceptFriendRequest.mutate(r.id)}
                        disabled={acceptFriendRequest.isPending}
                      >
                        {acceptFriendRequest.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Check className="w-5 h-5" />
                        )}
                      </Button>
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
                <div className="text-center py-10 text-muted-foreground">
                  No sent requests
                </div>
              ) : (
                outgoingRequests.map(r => (
                  <div 
                    key={r.id} 
                    className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 opacity-80"
                  >
                    {renderProfile(r.addressee, "Request sent")}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-8" 
                      onClick={() => cancelSentRequest.mutate(r.id)}
                      disabled={cancelSentRequest.isPending}
                    >
                      {cancelSentRequest.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      Cancel
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* DISCOVER */}
        <TabsContent value="discover" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button 
              onClick={() => setDiscoverView('suggestions')} 
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                discoverView === 'suggestions' 
                  ? 'bg-background shadow-sm font-medium text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Suggestions
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

          {/* SUGGESTIONS VIEW */}
          {discoverView === 'suggestions' && (
            <div className="space-y-2">
              {loadingSuggestions ? (
                <FriendSkeleton />
              ) : suggestions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No users found' : 'No suggestions available'}
                </div>
              ) : (
                suggestions.map(p => {
                  const isPending = existingIds.has(p.user_id);
                  return (
                    <div 
                      key={p.user_id} 
                      className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40"
                    >
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

          {/* CONTACTS VIEW */}
          {discoverView === 'contacts' && (
            <div className="space-y-3">
              {/* Add Contact Form */}
              {showAddContact ? (
                <Card className="border-2 border-primary/20 bg-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">Add New Contact</h3>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setShowAddContact(false);
                          setNewContactName("");
                          setNewContactEmail("");
                          setNewContactPhone("");
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <Input
                      placeholder="Full Name *"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="bg-background"
                    />
                    
                    <Input
                      type="email"
                      placeholder="Email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      className="bg-background"
                    />
                    
                    <Input
                      type="tel"
                      placeholder="Phone Number"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      className="bg-background"
                    />
                    
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                        onClick={() => addContact.mutate()}
                        disabled={addContact.isPending || !newContactName.trim()}
                      >
                        {addContact.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <User className="w-4 h-4 mr-2" />
                        )}
                        Save / Connect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                  onClick={() => setShowAddContact(true)}
                >
                  <User className="w-4 h-4 mr-2" />
                  Add New Contact
                </Button>
              )}

              {/* Contacts List */}
              {loadingContacts ? (
                <FriendSkeleton />
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {search ? 'No contacts match your search' : showAddContact ? '' : 'No contacts yet. Add someone to invite them!'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => {
                    const wasInvited = !!contact.invited_at;
                    const invitedRecently = wasInvited && 
                      (new Date().getTime() - new Date(contact.invited_at!).getTime()) < 24 * 60 * 60 * 1000;
                    
                    return (
                      <div 
                        key={contact.id} 
                        className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40"
                      >
                        {renderContact(contact)}
                        
                        <div className="flex gap-1">
                          {/* CHANGED: Replaced SMS Invite with Connect/Add Friend Logic */}
                          <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8"
                              onClick={() => connectToContact.mutate(contact)}
                              disabled={connectToContact.isPending || (!contact.email && !contact.phone)}
                            >
                              {connectToContact.isPending && connectToContact.variables?.id === contact.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <UserPlus className="w-3 h-3 mr-1" />
                              )}
                              Add
                            </Button>
                          
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="text-xs h-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => deleteContact.mutate(contact.id)}
                            disabled={deleteContact.isPending}
                          >
                            {deleteContact.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
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
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          About Contacts
                        </p>
                        <p className="text-blue-700 dark:text-blue-300 text-xs">
                          Click "Add" on a contact to see if they are on the app and send a request.
                        </p>
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