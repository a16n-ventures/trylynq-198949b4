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
    if (userId) ids.add(userId);
    return ids;
  }, [friends, incomingRequests, outgoingRequests, userId]);


  // 4. Suggestions (SMART LOGIC: Mutuals + Contact Matches)
  const { data: suggestions = [], isPending: loadingSuggestions } = useQuery<SuggestionProfile[]>({
    queryKey: ['suggestions', userId, debouncedSearch, existingIds.size, friends.length, contacts.length],
    queryFn: async () => {
      if (!userId) return [];
      
      // We will build a map to store unique suggestions with a score
      // Score system: 
      // +100 = Found in your uploaded contacts
      // +20 per mutual friend
      // +1 = Random discovery
      const suggestionsMap = new Map<string, SuggestionProfile>();
      const excludeIds = Array.from(existingIds);

      // --- STRATEGY A: MATCH CONTACTS (High Priority) ---
      // Matches people from your uploaded phonebook who are on the app
      if (contacts.length > 0) {
        const contactEmails = contacts.map(c => c.email).filter(Boolean) as string[];
        const contactPhones = contacts.map(c => c.phone?.replace(/\D/g, '')).filter(Boolean) as string[];

        // Only run if we have data to match
        if (contactEmails.length > 0 || contactPhones.length > 0) {
          let matchQuery = supabase.from('profiles').select('user_id, display_name, avatar_url, email, phone');
          
          const conditions = [];
          if (contactEmails.length) conditions.push(`email.in.(${contactEmails.map(e => `"${e}"`).join(',')})`);
          // Note: Phone matching via 'in' requires clean data. 
          // Ideally you'd have a 'normalized_phone' column. For now we try exact match on what's in DB.
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
      // "People who are friends with my friends"
      const myFriendIds = friends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
      
      if (myFriendIds.length > 0) {
        // We limit to checking the last 20 friends to keep performance high
        const recentFriendIds = myFriendIds.slice(0, 20);
        
        // Find friendships where one party is one of MY friends
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
          // Identify the "Third Party" (the potential suggestion)
          // If my friend is Requester, the Suggestion is Addressee.
          // If my friend is Addressee, the Suggestion is Requester.
          let potential: any = null;
          let potentialId = '';

          if (myFriendIds.includes(m.requester_id)) {
            potential = m.addressee;
            potentialId = m.addressee_id;
          } else {
            potential = m.requester;
            potentialId = m.requester_id;
          }

          // Filter out myself and people I already know
          if (potentialId && potentialId !== userId && !excludeIds.includes(potentialId)) {
             const existing = suggestionsMap.get(potentialId);
             
             // Calculate mutual count
             // If already in map, we parse the previous reason to increment count
             // (Simple parsing logic for this example)
             let currentScore = existing?.score || 0;
             let mutualCount = 0;
             
             if (existing && existing.reason?.includes('mutual')) {
                const match = existing.reason.match(/(\d+)/);
                if (match) mutualCount = parseInt(match[0]);
             }

             const newCount = mutualCount + 1;
             
             // Base score 20, +10 for every additional mutual friend
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
      // If we don't have enough smart suggestions, fill with randoms (or search results)
      if (suggestionsMap.size < 20) {
         let discoveryQuery = supabase.from('profiles').select('user_id, display_name, avatar_url');
         
         if (debouncedSearch) {
             discoveryQuery = discoveryQuery.ilike('display_name', `%${debouncedSearch}%`);
         }
         
         // Exclude existing friends + people already in our smart suggestion map
         const allExclusions = [...excludeIds, ...Array.from(suggestionsMap.keys())];
         if (allExclusions.length > 0) {
             // Chunking might be needed for very large lists, but fine for now
             discoveryQuery = discoveryQuery.not('user_id', 'in', `(${allExclusions.join(',')})`);
         }

         const { data: randomUsers } = await discoveryQuery.limit(20 - suggestionsMap.size);
         
         randomUsers?.forEach(p => {
            suggestionsMap.set(p.user_id, { ...p, score: 1, reason: 'Suggested for you' });
         });
      }

      // Convert Map to Array and Sort by Score (Desc)
      return Array.from(suggestionsMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    },
    enabled: activeTab === 'discover' && discoverView === 'suggestions',
    staleTime: 60000, 
  });


  // --- MUTATIONS ---
  
  const sendFriendRequest = useMutation({
    mutationFn: async (targetProfile: Profile) => {
      if (!userId) throw new Error("Not authenticated");

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

      supabase.from('notifications').insert({
        user_id: targetProfile.user_id,
        type: 'friend_request',
        title: 'New Friend Request',
        content: `You have a new friend request.`,
        data: { requester_id: userId },
      }).then(({ error: notifError }) => {
        if (notifError) console.error("Notification failed:", notifError);
      });
      
      return data;
    },
    onSuccess: async () => {
      toast.success('Friend request sent');
      await Promise.all([
        refetchOutgoing(),
        queryClient.invalidateQueries({ queryKey: ['suggestions'] }),
      ]);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to send request";
      toast.error(message);
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
      if (!newContactEmail.trim() && !newContactPhone.trim()) {
        throw new Error("Either email or phone is required");
      }

      const email = newContactEmail.trim().toLowerCase();
      const phoneRaw = newContactPhone.trim();
      const phoneDigits = phoneRaw.replace(/\D/g, ''); 

      // --- IMPROVED LOGIC: Check Platform Users First ---
      console.log("Searching for user with:", { email, phoneDigits });

      let query = supabase.from('profiles').select('user_id, display_name, avatar_url, email, phone');
      
      const conditions = [];
      if (email) conditions.push(`email.eq.${email}`);
      if (phoneDigits.length > 6) {
        conditions.push(`phone.eq.${phoneRaw}`); 
      }

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
                return { status: 'pending', user: foundUser };
             }
           } else {
             const { error: reqError } = await supabase.from('friendships').insert({
               requester_id: userId,
               addressee_id: foundUser.user_id,
               status: 'pending'
             });
             
             if (reqError) throw reqError;
             
             supabase.from('notifications').insert({
                user_id: foundUser.user_id,
                type: 'friend_request',
                title: 'New Friend Request',
                content: `You have a new friend request.`,
                data: { requester_id: userId },
             });

             return { status: 'request_sent', user: foundUser };
           }
        }
      }

      // --- FALLBACK: No User Found, Save to Contacts ---
      if (email) {
        const { data: existingByEmail } = await supabase.from('contacts').select('id, name').eq('user_id', userId).eq('email', email).maybeSingle();
        if (existingByEmail) throw new Error(`Contact with this email already exists: ${existingByEmail.name}`);
      }

      if (phoneDigits) {
        const { data: existingByPhone } = await supabase.from('contacts').select('id, name, phone').not('phone', 'is', null).eq('user_id', userId);
        const duplicate = existingByPhone?.find(c => c.phone?.replace(/\D/g, '') === phoneDigits);
        if (duplicate) throw new Error(`Contact with this phone already exists: ${duplicate.name}`);
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: newContactName.trim(),
          email: email || null,
          phone: phoneRaw || null,
        })
        .select()
        .single();

      if (error) throw error;
      return { status: 'contact_saved', data };
    },
    onSuccess: async (result: any) => {
      // Clear form
      setNewContactName("");
      setNewContactEmail("");
      setNewContactPhone("");
      setShowAddContact(false);

      if (result.status === 'request_sent') {
        toast.success(`User found! Friend request sent to ${result.user.display_name}.`);
        await Promise.all([refetchOutgoing(), queryClient.invalidateQueries({ queryKey: ['suggestions'] })]);
      } else if (result.status === 'already_friends') {
        toast.info(`You are already friends with ${result.user.display_name}!`);
      } else if (result.status === 'pending') {
        toast.info(`A request is already pending for ${result.user.display_name}.`);
      } else {
        toast.success('Saved to contacts. (User not found in app)');
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

  const inviteContact = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!userId) throw new Error("Not authenticated");
      
      const { error: updateError } = await supabase
        .from('contacts')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', contact.id)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const appName = "OurApp";
      const inviteLink = "https://yourapp.com/join";
      const message = `Hey ${contact.name.split(' ')[0]}, join me on ${appName}! Download here: ${inviteLink}`;
      
      if (contact.phone) {
        const cleanPhone = contact.phone.replace(/[\s\-\(\)]/g, '');
        const ua = navigator.userAgent.toLowerCase();
        const isiOS = /iphone|ipad|ipod/.test(ua);
        const separator = isiOS ? '&' : '?';
        window.location.href = `sms:${cleanPhone}${separator}body=${encodeURIComponent(message)}`;
      } else if (contact.email) {
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Join me on " + appName)}&body=${encodeURIComponent(message)}`;
      } else {
        throw new Error("No phone or email available");
      }
      
      return contact;
    },
    onSuccess: async () => {
      await refetchContacts();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to invite contact');
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
                        {sendFriendRequest.isPending ? (
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
                          {wasInvited && invitedRecently ? (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-xs h-8 text-green-600 cursor-default"
                              disabled
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Invited
                            </Button>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8"
                              onClick={() => inviteContact.mutate(contact)}
                              disabled={inviteContact.isPending || (!contact.email && !contact.phone)}
                            >
                              {inviteContact.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3 mr-1" />
                              )}
                              {wasInvited ? 'Resend' : 'Invite'}
                            </Button>
                          )}
                          
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
                          Invite friends to join
                        </p>
                        <p className="text-blue-700 dark:text-blue-300 text-xs">
                          Click "Invite" to send them a link via SMS/Email to download the app.
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