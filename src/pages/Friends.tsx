import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, MessageSquare, UserPlus, Check, X, Filter, ArrowUpDown, Clock, Loader2, Send, Mail, User, Smartphone
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
  
  // Local state for optimistic updates to prevent "Already Pending" errors
  const [optimisticPendingIds, setOptimisticPendingIds] = useState<Set<string>>(new Set());

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
  });

  // 4. Contacts
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
  });

  // Helper: Source of truth for UI buttons (Merged with optimistic state)
  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach(f => {
      const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      ids.add(friendId);
    });
    incomingRequests.forEach(r => ids.add(r.requester_id));
    outgoingRequests.forEach(r => ids.add(r.addressee_id));
    // Merge Optimistic Updates
    optimisticPendingIds.forEach(id => ids.add(id));
    
    if (userId) ids.add(userId);
    return ids;
  }, [friends, incomingRequests, outgoingRequests, optimisticPendingIds, userId]);


  // 5. Suggestions
  const { data: suggestions = [], isPending: loadingSuggestions } = useQuery<SuggestionProfile[]>({
    queryKey: ['suggestions', userId, debouncedSearch, existingIds.size, friends.length, contacts.length],
    queryFn: async () => {
      if (!userId) return [];
      const suggestionsMap = new Map<string, SuggestionProfile>();
      const excludeIds = Array.from(existingIds);

      // Strategy A: Contact Matching
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
                  user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url, 
                  score: 100, reason: 'From your contacts' 
                });
              }
            });
          }
        }
      }

      // Strategy B: Mutual Friends
      const myFriendIds = friends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
      if (myFriendIds.length > 0) {
        const recentFriendIds = myFriendIds.slice(0, 20);
        const { data: mutualsData } = await supabase
          .from('friendships')
          .select(`requester_id, addressee_id, requester:profiles!requester_id(user_id, display_name, avatar_url), addressee:profiles!addressee_id(user_id, display_name, avatar_url)`)
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
             let mutualCount = existing?.reason?.includes('mutual') ? parseInt(existing.reason.match(/(\d+)/)?.[0] || '0') : 0;
             const newCount = mutualCount + 1;
             suggestionsMap.set(potentialId, { 
               user_id: potential.user_id, display_name: potential.display_name, avatar_url: potential.avatar_url,
               score: (existing?.score || 0) + 20, reason: `${newCount} mutual friend${newCount > 1 ? 's' : ''}` 
             });
          }
        });
      }

      // Strategy C: Discovery / Search
      if (suggestionsMap.size < 20 || debouncedSearch) {
         let discoveryQuery = supabase.from('profiles').select('user_id, display_name, avatar_url');
         if (debouncedSearch) discoveryQuery = discoveryQuery.ilike('display_name', `%${debouncedSearch}%`);
         const allExclusions = [...excludeIds, ...Array.from(suggestionsMap.keys())];
         if (allExclusions.length > 0) discoveryQuery = discoveryQuery.not('user_id', 'in', `(${allExclusions.join(',')})`);

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
    onMutate: async (targetProfile) => {
      // OPTIMISTIC UPDATE: Instantly add to pending list to disable button
      setOptimisticPendingIds(prev => new Set(prev).add(targetProfile.user_id));
    },
    onSuccess: async () => {
      toast.success('Friend request sent');
      await Promise.all([
        refetchOutgoing(),
        queryClient.invalidateQueries({ queryKey: ['suggestions'] }),
      ]);
    },
    onError: (error: any, targetProfile) => {
      // Handle the "Already Pending" gracefully
      if (error.message === "ALREADY_PENDING" || error.message.includes("pending")) {
        // It's technically a success from the user's perspective (it IS pending)
        // Just keep the optimistic update and don't show an error toast
        setOptimisticPendingIds(prev => new Set(prev).add(targetProfile.user_id));
      } else if (error.message === "ALREADY_FRIENDS") {
        toast.info("You are already friends with this user.");
      } else {
        toast.error("Failed to send request");
        // Revert optimistic update on real error
        setOptimisticPendingIds(prev => {
          const next = new Set(prev);
          next.delete(targetProfile.user_id);
          return next;
        });
      }
    }
  });

  // SMART CONNECT (For Contacts List)
  const connectWithContact = useMutation({
    mutationFn: async (contact: Contact) => {
       // 1. Search if this contact exists as a User
       const conditions = [];
       if (contact.email) conditions.push(`email.eq.${contact.email}`);
       if (contact.phone) {
         // Try matching phone (simple clean)
         const cleanPhone = contact.phone.replace(/\D/g, ''); 
         if (cleanPhone.length > 6) {
             // We try to match loosely or exactly depending on your DB
             conditions.push(`phone.eq.${contact.phone}`);
         }
       }

       let targetUser = null;
       if (conditions.length > 0) {
         const { data } = await supabase.from('profiles')
            .select('user_id, display_name')
            .or(conditions.join(','))
            .maybeSingle();
         targetUser = data;
       }

       if (targetUser) {
           // User Exists! Send Friend Request
           try {
              await sendFriendRequest.mutateAsync({ user_id: targetUser.user_id } as Profile);
              return { type: 'request_sent', user: targetUser };
           } catch (e: any) {
              if (e.message === 'ALREADY_FRIENDS') return { type: 'already_friends' };
              if (e.message === 'ALREADY_PENDING') return { type: 'already_pending' };
              throw e;
           }
       } else {
           // User Does Not Exist -> Fallback to Invite
           return { type: 'invite_needed', contact };
       }
    },
    onSuccess: (result) => {
        if (result.type === 'request_sent') {
            toast.success(`Request sent to ${result.user?.display_name}!`);
        } else if (result.type === 'invite_needed') {
            // Trigger the SMS/Email logic
            const contact = result.contact!;
            const appName = "Lynq";
            const inviteLink = "https://lynq.app/join";
            const message = `Hey ${contact.name.split(' ')[0]}, join me on ${appName}! Download here: ${inviteLink}`;
            
            if (contact.phone) {
                const cleanPhone = contact.phone.replace(/\D/g, '');
                const isiOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
                window.location.href = `sms:${cleanPhone}${isiOS ? '&' : '?'}body=${encodeURIComponent(message)}`;
            } else if (contact.email) {
                window.location.href = `mailto:${contact.email}?subject=Join me on ${appName}&body=${encodeURIComponent(message)}`;
            } else {
                toast.error("No valid phone or email for this contact.");
            }
        }
    },
    onError: (e) => {
        toast.error("Failed to connect: " + e.message);
    }
  });


  // Other Mutations (Accept/Reject/Cancel/AddContact)
  const acceptFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Friend added!');
      await Promise.all([refetchFriends(), refetchIncoming()]);
    }
  });

  const rejectFriendRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => await refetchIncoming()
  });

  const cancelSentRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
       toast.info('Request cancelled');
       await refetchOutgoing();
    }
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: async () => { toast.info('Contact removed'); await refetchContacts(); }
  });

  // Simplified Add Contact (Manually)
  const addContact = useMutation({
    mutationFn: async () => {
      if (!newContactName.trim()) throw new Error("Name is required");
      const name = newContactName.trim();
      const email = newContactEmail.trim().toLowerCase();
      const phone = newContactPhone.trim();

      // 1. Try to find user first (by name/email/phone)
      let query = supabase.from('profiles').select('*').neq('user_id', userId);
      const conditions = [`display_name.ilike.${name}`];
      if (email) conditions.push(`email.eq.${email}`);
      if (phone) conditions.push(`phone.eq.${phone}`);
      
      const { data: users } = await query.or(conditions.join(',')).maybeSingle();

      if (users) {
         // Found user -> Connect immediately
         await sendFriendRequest.mutateAsync({ user_id: users.user_id } as Profile);
         return { type: 'connected', user: users };
      }

      // 2. Not found -> Save contact
      if (!email && !phone) throw new Error("User not found. Add email/phone to save as contact.");
      const { error } = await supabase.from('contacts').insert({ user_id: userId, name, email: email || null, phone: phone || null });
      if (error) throw error;
      return { type: 'saved' };
    },
    onSuccess: (res) => {
       setShowAddContact(false);
       setNewContactName(""); setNewContactEmail(""); setNewContactPhone("");
       if (res.type === 'connected') toast.success(`Request sent to ${res.user.display_name}`);
       else { toast.success('Saved to contacts'); refetchContacts(); }
    },
    onError: (e) => toast.error(e.message)
  });


  // --- RENDER HELPERS ---
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
        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
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

  // Filter Logic
  const filteredFriends = useMemo(() => {
    let res = [...friends];
    if (debouncedSearch) {
      res = res.filter(f => {
        const p = f.requester_id === userId ? f.addressee : f.requester;
        return p.display_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
      });
    }
    return res;
  }, [friends, debouncedSearch, userId]);

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(debouncedSearch.toLowerCase()));
  }, [contacts, debouncedSearch]);


  return (
    <div className="container-mobile py-4 space-y-4 min-h-[80vh] pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
      </div>
      
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search} onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search friends..." className="pl-10 bg-background/50 backdrop-blur-sm"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOption('newest')}><ArrowUpDown className="mr-2 h-4 w-4" /> Newest First</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption('alphabetical')}><Filter className="mr-2 h-4 w-4" /> Alphabetical</DropdownMenuItem>
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

        {/* ALL FRIENDS TAB */}
        <TabsContent value="all" className="mt-4 space-y-2">
          {loadingFriends ? <FriendSkeleton /> : filteredFriends.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No friends yet.</div>
          ) : (
            filteredFriends.map(f => {
              const p = f.requester_id === userId ? f.addressee : f.requester;
              return (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-accent/5 cursor-pointer" onClick={() => navigate(`/messages?userId=${p.user_id}`)}>
                  {renderProfile(p, "Connected")}
                  <Button variant="ghost" size="icon"><MessageSquare className="w-5 h-5 text-primary" /></Button>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button onClick={() => setRequestView('received')} className={`px-4 py-1.5 text-sm rounded-md transition-all ${requestView === 'received' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Received</button>
            <button onClick={() => setRequestView('sent')} className={`px-4 py-1.5 text-sm rounded-md transition-all ${requestView === 'sent' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Sent</button>
          </div>
          {requestView === 'received' ? (
            incomingRequests.length === 0 ? <div className="text-center py-10 text-muted-foreground">No incoming requests</div> :
            incomingRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                {renderProfile(r.requester, "Wants to connect")}
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="text-red-500" onClick={() => rejectFriendRequest.mutate(r.id)}><X className="w-5 h-5" /></Button>
                  <Button size="icon" className="gradient-primary text-white rounded-full" onClick={() => acceptFriendRequest.mutate(r.id)}><Check className="w-5 h-5" /></Button>
                </div>
              </div>
            ))
          ) : (
            outgoingRequests.length === 0 ? <div className="text-center py-10 text-muted-foreground">No sent requests</div> :
            outgoingRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 opacity-80">
                {renderProfile(r.addressee, "Request sent")}
                <Button size="sm" variant="outline" className="text-xs" onClick={() => cancelSentRequest.mutate(r.id)}>Cancel</Button>
              </div>
            ))
          )}
        </TabsContent>

        {/* DISCOVER TAB */}
        <TabsContent value="discover" className="mt-4">
          <div className="flex gap-2 mb-4 p-1 bg-muted/20 rounded-lg w-fit mx-auto">
            <button onClick={() => setDiscoverView('suggestions')} className={`px-4 py-1.5 text-sm rounded-md transition-all ${discoverView === 'suggestions' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Suggestions</button>
            <button onClick={() => setDiscoverView('contacts')} className={`px-4 py-1.5 text-sm rounded-md transition-all ${discoverView === 'contacts' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>My Contacts</button>
          </div>

          {/* SUGGESTIONS VIEW */}
          {discoverView === 'suggestions' && (
            <div className="space-y-2">
              {loadingSuggestions ? <FriendSkeleton /> : suggestions.length === 0 ? <div className="text-center py-10 text-muted-foreground">No suggestions available</div> :
                suggestions.map(p => {
                  // Use robust check including optimistic updates
                  const isPending = existingIds.has(p.user_id);
                  return (
                    <div key={p.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                      {renderProfile(p, "Suggested for you")}
                      <Button 
                        size="sm" 
                        className={isPending ? "bg-transparent border border-primary/20 text-muted-foreground" : "gradient-primary text-white"}
                        variant={isPending ? "outline" : "default"}
                        disabled={isPending || sendFriendRequest.isPending}
                        onClick={() => !isPending && sendFriendRequest.mutate(p)}
                      >
                        {isPending ? <><Clock className="w-3 h-3 mr-1" /> Pending</> : <><UserPlus className="w-3 h-3 mr-1" /> Add</>}
                      </Button>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* CONTACTS VIEW - Improved with SMART CONNECT */}
          {discoverView === 'contacts' && (
            <div className="space-y-3">
              {showAddContact ? (
                <Card className="border-2 border-primary/20 bg-card animate-in fade-in zoom-in-95">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center"><h3 className="font-semibold text-sm">Add New Contact</h3><Button variant="ghost" size="sm" onClick={() => setShowAddContact(false)}><X className="w-4 h-4" /></Button></div>
                    <Input placeholder="Full Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
                    <Input placeholder="Phone (Optional)" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
                    <Input placeholder="Email (Optional)" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
                    <Button className="w-full gradient-primary text-white" onClick={() => addContact.mutate()} disabled={addContact.isPending}>{addContact.isPending ? <Loader2 className="animate-spin" /> : 'Save / Connect'}</Button>
                  </CardContent>
                </Card>
              ) : (
                <Button className="w-full gradient-primary text-white" onClick={() => setShowAddContact(true)}><UserPlus className="w-4 h-4 mr-2" /> Add New Contact</Button>
              )}

              {loadingContacts ? <FriendSkeleton /> : filteredContacts.length === 0 ? <div className="text-center py-10 text-muted-foreground">No contacts found</div> :
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <div key={contact.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
                      {renderContact(contact)}
                      <div className="flex gap-1">
                        {/* REPLACED 'INVITE' WITH SMART 'CONNECT' BUTTON */}
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-xs h-8 border-primary/20 hover:bg-primary/5 text-primary"
                          onClick={() => connectWithContact.mutate(contact)}
                          disabled={connectWithContact.isPending}
                        >
                          {connectWithContact.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3 mr-1" />}
                          Connect
                        </Button>
                        
                        <Button size="sm" variant="ghost" className="text-xs h-8 text-red-500 hover:bg-red-50" onClick={() => deleteContact.mutate(contact.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
