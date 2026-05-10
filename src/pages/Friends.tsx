import { useState, useEffect } from 'react';
import { 
  Search, UserPlus, Users, MessageCircle, MoreVertical, 
  X, Check, Loader2, Phone, Share2, Shield, UserMinus,
  MapPin, Sparkles, QrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ContactImportModal } from '@/components/ContactImportModal';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useGeolocation } from '@/contexts/LocationContext';
import type { Profile } from '@/hooks/useFriends';

// --- TYPES ---
interface Friend {
  id: string; // Profile ID
  user_id: string; 
  display_name: string;
  username: string;
  avatar_url: string | null;
  friendship_id?: string;
  is_contact?: boolean;
}

interface Suggestion {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  distance_km?: number;
  mutual_count?: number;
  is_new?: boolean; 
  score?: number;
}

interface Request {
  id: string;
  requester: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
  created_at: string;
}

const Friends = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { location } = useGeolocation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('circle');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();
  const [pendingConnectIds, setPendingConnectIds] = useState<Set<string>>(new Set());
  const [pendingAcceptIds, setPendingAcceptIds] = useState<Set<string>>(new Set());
  const [pendingDeclineIds, setPendingDeclineIds] = useState<Set<string>>(new Set());

  const openProfilePreview = (friend: Friend) => {
    setPreviewProfile({
      user_id: friend.user_id,
      display_name: friend.display_name,
      avatar_url: friend.avatar_url,
    });
    setPreviewFriendshipId(friend.friendship_id);
  };

  // --- 1. DATA FETCHING ---

  // A. Fetch My Friends (Confirmed)
  const { data: friends = [], isLoading: loadingFriends, error: friendsError } = useQuery({
    queryKey: ['my_friends_page', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        console.log('No user ID available for friends query');
        return [];
      }
      
      try {
        const { data, error } = await supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status, created_at')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');

        if (error) {
          console.error('Friendships query error:', error);
          throw error;
        }

        if (!data) {
          console.log('No friendships data returned');
          return [];
        }

        // Fetch profiles for all users in these friendships
        const userIds = new Set<string>();
        (data || []).forEach((f: any) => {
          userIds.add(f.requester_id);
          userIds.add(f.addressee_id);
        });

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, username, avatar_url')
          .in('user_id', Array.from(userIds));

        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        const validFriends = (data || [])
          .map((f: any) => {
            const isRequester = f.requester_id === user.id;
            const otherId = isRequester ? f.addressee_id : f.requester_id;
            const profile = profileMap.get(otherId);
            
            if (!profile) {
              console.warn('Skipping friendship with missing profile:', f.id);
              return null;
            }

            return {
              id: profile.id,
              user_id: profile.user_id,
              display_name: profile.display_name || 'User',
              username: profile.username || 'user',
              avatar_url: profile.avatar_url,
              friendship_id: f.id,
              is_contact: false
            } as Friend;
          })
          .filter((f): f is Friend => f !== null);

        console.log(`Loaded ${validFriends.length} friends`);
        return validFriends;
      } catch (error) {
        console.error('Failed to fetch friends:', error);
        throw error;
      }
    },
    enabled: !!user?.id,
    retry: 2,
    retryDelay: 1000
  });
  
  // Handle query errors
  useEffect(() => {
    if (friendsError) {
      console.error('Friends query error:', friendsError);
      const errorMessage = friendsError instanceof Error ? friendsError.message : 'Failed to load friends';
      toast.error(errorMessage);
    }
  }, [friendsError]);

  // B. Fetch Imported Contacts (Who are on App but NOT friends yet)
  const { data: contacts = [] } = useQuery({
    queryKey: ['app_contacts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      try {
        // 1. Get contacts marked as app users
        const { data: myContacts } = await supabase
          .from('contacts')
          .select('matched_user_id, name')
          .eq('user_id', user.id)
          .eq('is_app_user', true)
          .not('matched_user_id', 'is', null);
    
        if (!myContacts?.length) return [];
    
        const contactUserIds = myContacts.map(c => c.matched_user_id);
        
        // 2. Fetch existing friends to exclude them
        const { data: existingFriends } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
          // Note: We check ALL friendships (pending or accepted) to avoid duplicate requests
        
        const friendIds = existingFriends?.map((f: any) => 
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        ) || [];
        
        const newContactIds = contactUserIds.filter(id => !friendIds.includes(id) && id !== user.id);
    
        if (newContactIds.length === 0) return [];
    
        // 3. Fetch profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, username, avatar_url')
          .in('user_id', newContactIds);
    
        return (profiles || []).map((p: any) => ({
          ...p,
          is_contact: true,
          // Prefer the contact name saved in phone, fallback to profile name
          display_name: myContacts.find(c => c.matched_user_id === p.user_id)?.name || p.display_name
        }));
      } catch (error) {
        console.error('Failed to fetch contacts:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });

  // C. Fetch Smart Suggestions (Nearby + Mutual + Shared interests)
  const { data: suggestions = [] } = useQuery({
    queryKey: ['friend_suggestions', user?.id, location?.latitude],
    queryFn: async () => {
      if (!user?.id) return [];

      try {
        // Fetch my interests + my friends for ranking/exclusion
        const [{ data: me }, { data: existingFriends }] = await Promise.all([
          supabase.from('profiles').select('interests').eq('user_id', user.id).maybeSingle(),
          supabase.from('friendships')
            .select('requester_id, addressee_id')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        ]);
        const myInterests: string[] = Array.isArray((me as any)?.interests) ? (me as any).interests : [];
        const friendIds = (existingFriends || []).map((f: any) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );

        // 1. Try RPC for nearby (in-city) candidates
        let candidates: any[] = [];
        if (location) {
          const { data: rpcData } = await supabase.rpc('suggest_nearby_friends', {
            requesting_user_id: user.id,
            user_lat: location.latitude,
            user_long: location.longitude,
            limit_count: 20,
          });
          if (rpcData?.length) {
            candidates = rpcData.map((s: any) => ({
              user_id: s.friend_id || s.user_id,
              display_name: s.display_name,
              username: s.username || 'suggested',
              avatar_url: s.avatar_url,
              distance_km: s.distance_km,
            }));
          }
        }

        // 2. Fallback: random profiles
        if (candidates.length === 0) {
          let q = supabase
            .from('profiles')
            .select('user_id, display_name, username, avatar_url, created_at')
            .neq('user_id', user.id)
            .limit(20);
          if (friendIds.length > 0) q = q.not('user_id', 'in', `(${friendIds.join(',')})`);
          const { data: random } = await q;
          candidates = random || [];
        }

        const candidateIds = candidates.map(c => c.user_id);
        if (candidateIds.length === 0) return [];

        // 3. Enrich with interests + mutuals
        const { data: candidateProfiles } = await supabase
          .from('profiles')
          .select('user_id, interests, created_at')
          .in('user_id', candidateIds);
        const profMap = new Map((candidateProfiles || []).map((p: any) => [p.user_id, p]));

        const mutualCounts = new Map<string, number>();
        if (friendIds.length > 0) {
          const { data: theirEdges } = await supabase
            .from('friendships')
            .select('requester_id, addressee_id, status')
            .or(`requester_id.in.(${candidateIds.join(',')}),addressee_id.in.(${candidateIds.join(',')})`)
            .eq('status', 'accepted');
          (theirEdges || []).forEach((e: any) => {
            const candidate = candidateIds.includes(e.requester_id) ? e.requester_id : e.addressee_id;
            const other = e.requester_id === candidate ? e.addressee_id : e.requester_id;
            if (friendIds.includes(other)) {
              mutualCounts.set(candidate, (mutualCounts.get(candidate) || 0) + 1);
            }
          });
        }

        return candidates.map((c: any) => {
          const p: any = profMap.get(c.user_id) || {};
          const theirInterests: string[] = Array.isArray(p.interests) ? p.interests : [];
          const sharedInterests = myInterests.filter(i => theirInterests.includes(i)).length;
          const isNew = p.created_at && new Date(p.created_at) > new Date(Date.now() - 7 * 86400000);
          const mutual_count = mutualCounts.get(c.user_id) || 0;
          // Composite ranking score: nearby > mutuals > shared interests > new
          const score =
            (c.distance_km != null ? Math.max(0, 25 - c.distance_km) * 4 : 0) +
            mutual_count * 10 +
            sharedInterests * 5 +
            (isNew ? 2 : 0);
          return {
            ...c,
            mutual_count,
            shared_interests: sharedInterests,
            is_new: !!isNew,
            score,
          };
        }).sort((a, b) => b.score - a.score).slice(0, 8);
      } catch (e) {
        console.error('Suggestion fetch failed', e);
        return [];
      }
    },
    enabled: !!user,
  });

  // D. Fetch Requests
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      try {
        const { data, error } = await supabase
          .from('friendships')
          .select('id, created_at, requester_id')
          .eq('addressee_id', user.id)
          .eq('status', 'pending');

        if (error) {
          console.error('Friend requests query error:', error);
          throw error;
        }

        const requesterIds = (data || []).map((r: any) => r.requester_id);
        if (requesterIds.length === 0) return [];

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, username, avatar_url')
          .in('user_id', requesterIds);

        const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        return (data || [])
          .map((r: any) => {
            const p: any = profMap.get(r.requester_id);
            if (!p) return null;
            return {
              id: r.id,
              created_at: r.created_at,
              requester: {
                id: p.id,
                display_name: p.display_name || 'User',
                username: p.username || 'user',
                avatar_url: p.avatar_url,
              },
            } as Request;
          })
          .filter(Boolean) as Request[];
      } catch (error) {
        console.error('Failed to fetch friend requests:', error);
        return [];
      }
    },
    enabled: !!user?.id
  });

  // --- 2. ACTIONS ---

  const handleConnect = useMutation({
    mutationFn: async (targetId: string) => {
        setPendingConnectIds(prev => new Set(prev).add(targetId));
        const { error } = await supabase.from('friendships').insert({
            requester_id: user?.id,
            addressee_id: targetId,
            status: 'pending'
        });
        if (error) throw error;
    },
    onSuccess: (_data, targetId) => {
        toast.success("Friend request sent!");
        queryClient.invalidateQueries({ queryKey: ['friend_suggestions'] });
        queryClient.invalidateQueries({ queryKey: ['app_contacts'] });
    },
    onError: (err: Error, targetId) => {
      setPendingConnectIds(prev => { const s = new Set(prev); s.delete(targetId); return s; });
      toast.error(err.message || "Could not send request");
    }
  });

  const handleAccept = useMutation({
    mutationFn: async (friendshipId: string) => {
      setPendingAcceptIds(prev => new Set(prev).add(friendshipId));
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: (_data, friendshipId) => {
      setPendingAcceptIds(prev => { const s = new Set(prev); s.delete(friendshipId); return s; });
      toast.success("Friend added!");
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
      queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
      queryClient.invalidateQueries({ queryKey: ['friend_suggestions'] });
    },
    onError: (_err, friendshipId) => {
      setPendingAcceptIds(prev => { const s = new Set(prev); s.delete(friendshipId); return s; });
      toast.error("Failed to accept request");
    }
  });

  const handleDecline = useMutation({
    mutationFn: async (friendshipId: string) => {
        setPendingDeclineIds(prev => new Set(prev).add(friendshipId));
        const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
        if (error) throw error;
    },
    onSuccess: (_data, friendshipId) => {
        setPendingDeclineIds(prev => { const s = new Set(prev); s.delete(friendshipId); return s; });
        toast.success("Request removed");
        queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
    },
    onError: (_err, friendshipId) => {
      setPendingDeclineIds(prev => { const s = new Set(prev); s.delete(friendshipId); return s; });
      toast.error("Failed to remove request");
    }
  });

  // Combined list: Friends first, then imported contacts (with label)
  const allContactsList: Friend[] = [
      ...friends,
      ...contacts.map(c => ({ 
        ...c, 
        id: c.user_id || c.id, 
        friendship_id: 'contact',
        is_contact: true,
        display_name: c.display_name || c.name || 'Contact'
      })) 
  ];

  // Also fetch raw imported contacts (not matched to app users) to show with label
  const { data: rawImportedContacts = [] } = useQuery({
    queryKey: ['raw_imported_contacts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, username, is_app_user, matched_user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Imported contacts that are NOT yet matched / not app users
  const unmatchedImports = rawImportedContacts
    .filter(c => !c.is_app_user && !c.matched_user_id)
    .map(c => ({
      id: c.id,
      user_id: c.id,
      display_name: c.name,
      username: c.username || c.phone || '',
      avatar_url: null,
      friendship_id: 'imported',
      is_contact: true,
    }));

  const fullList = [...allContactsList, ...unmatchedImports];

  const filteredList = fullList.filter(f => 
    f.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Friends</h1>
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" className="rounded-full">
                <QrCode className="w-5 h-5 text-primary" />
            </Button>
            <Button size="sm" variant="outline" className="rounded-full gap-2" onClick={() => setIsImportOpen(true)}>
                <UserPlus className="w-4 h-4" /> Add
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search friends & contacts..." 
            className="pl-9 bg-muted/50 border-0 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-xl p-1 mb-6">
            <TabsTrigger value="circle" className="rounded-lg">
              My Circle ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-lg">
              <span className="relative inline-flex items-center gap-1.5">
                Requests
                {requests.length > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold bg-red-500 text-white animate-pulse leading-none">
                    {requests.length}
                  </span>
                )}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* MY CIRCLE TAB */}
          <TabsContent value="circle" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* 1. SUGGESTIONS (Only show if suggestions exist) */}
            {suggestions.length > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> People nearby
                        </h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">{suggestions.map((s) => (
                        <div key={s.user_id} className="min-w-[150px] w-[150px] p-3 rounded-2xl border bg-card/50 flex flex-col items-center text-center shadow-sm relative group hover:border-primary/50 transition-all">
                          
                          {/* 🆕 New Account Badge */}
                          {s.is_new && (
                            <Badge className="absolute -top-2 -right-1 bg-blue-500 hover:bg-blue-600 border-none px-1.5 py-0 text-[9px] h-4">
                              NEW
                            </Badge>
                          )}
                      
                          <Avatar className="h-16 w-16 mb-2 border-2 border-background shadow-md">
                            <AvatarImage src={s.avatar_url || undefined} />
                            <AvatarFallback>{s.display_name?.[0]}</AvatarFallback>
                          </Avatar>
                      
                          <h4 className="font-bold text-sm truncate w-full">{s.display_name}</h4>
                          
                          {/* Prioritize Distance Display */}
                          {s.distance_km ? (
                            <p className="text-[10px] font-bold text-primary flex items-center gap-1 mb-1">
                              <MapPin className="w-2.5 h-2.5" /> {s.distance_km.toFixed(1)}km away
                            </p>
                          ) : null}
                      
                          {/* Secondary: Mutual Count */}
                          {s.mutual_count > 0 && (
                            <p className="text-[9px] text-muted-foreground mb-3">
                              {s.mutual_count} mutual friend{s.mutual_count > 1 ? 's' : ''}
                            </p>
                          )}
                          {!s.distance_km && !s.mutual_count && (
                            <p className="text-[10px] text-muted-foreground mb-3">Suggested</p>
                          )}
                                <Button 
                                    size="sm" 
                                    className="w-full h-8 text-xs rounded-lg"
                                    onClick={() => handleConnect.mutate(s.user_id)}
                                    disabled={pendingConnectIds.has(s.user_id)}
                                >
                                    {pendingConnectIds.has(s.user_id) ? 'Sent ✓' : 'Connect'}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. MAIN LIST */}
            {friendsError ? (
              <div className="text-center py-12 text-destructive border-2 border-dashed border-destructive/50 rounded-xl bg-destructive/5">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-destructive/50" />
                </div>
                <h3 className="font-semibold mb-2">Failed to load friends</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {friendsError instanceof Error ? friendsError.message : 'An error occurred'}
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['my_friends_page'] })}
                >
                  Try Again
                </Button>
              </div>
            ) : loadingFriends ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No friends found.</p>
                <Button variant="link" onClick={() => setIsImportOpen(true)}>Sync Contacts</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Import Banner */}
                <div 
                  className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors mb-4"
                  onClick={() => setIsImportOpen(true)}
                >
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-sm">Find from contacts</h4>
                        <p className="text-xs text-muted-foreground">See who's already here</p>
                    </div>
                    <Check className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider mb-2">
                    All Friends ({friends.length})
                </div>

                {filteredList.map(friend => (
                  <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border shadow-sm group hover:shadow-md transition-shadow">
                    <Avatar className="h-12 w-12 cursor-pointer" onClick={() => openProfilePreview(friend)}>
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>{friend.display_name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openProfilePreview(friend)}>
                      <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                          {friend.display_name}
                          {friend.friendship_id === 'imported' && <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-blue-50 text-blue-600 border-blue-200">Imported from contacts</Badge>}
                          {friend.friendship_id === 'contact' && friend.is_contact && <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-muted text-muted-foreground">From Contacts</Badge>}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      {friend.friendship_id === 'contact' || friend.friendship_id === 'imported' ? (
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="h-8 px-3" 
                            onClick={() => friend.friendship_id !== 'imported' && handleConnect.mutate(friend.user_id)}
                            disabled={pendingConnectIds.has(friend.user_id) || friend.friendship_id === 'imported'}
                          >
                              {friend.friendship_id === 'imported' ? 'Not on app' : pendingConnectIds.has(friend.user_id) ? 'Sent ✓' : <><UserPlus className="w-4 h-4 mr-1.5" /> Add</>}
                          </Button>
                      ) : (
                          <>
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                className="rounded-full h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => navigate(`/app/messages?userId=${friend.user_id}`)}
                            >
                                <MessageCircle className="w-5 h-5" />
                            </Button>
                            
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="rounded-full h-9 w-9 text-muted-foreground">
                                    <MoreVertical className="w-5 h-5" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openProfilePreview(friend)}>
                                    View Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600">
                                    <UserMinus className="w-4 h-4 mr-2" /> Unfriend
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* REQUESTS TAB */}
          <TabsContent value="requests" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            {loadingRequests ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : requests.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-2xl border-2 border-dashed border-muted">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <h3 className="font-semibold">No pending requests</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Share your profile to connect with more people.
                </p>
                <Button variant="link" className="mt-2" onClick={() => {
                   navigator.clipboard.writeText(`https://clyx.app/u/${user?.id}`);
                   toast.success("Profile link copied!");
                }}>
                  <Share2 className="w-4 h-4 mr-2" /> Copy Link
                </Button>
              </div>
            ) : (
              requests.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-4 bg-card rounded-xl border shadow-sm">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={req.requester.avatar_url || undefined} />
                    <AvatarFallback>{req.requester.display_name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm">{req.requester.display_name}</h4>
                    <p className="text-xs text-muted-foreground">wants to connect</p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-9 w-9 p-0 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDecline.mutate(req.id)}
                      disabled={pendingDeclineIds.has(req.id) || pendingAcceptIds.has(req.id)}
                    >
                      {pendingDeclineIds.has(req.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-5 h-5" />}
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-9 w-9 p-0 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-sm"
                      onClick={() => handleAccept.mutate(req.id)}
                      disabled={pendingAcceptIds.has(req.id) || pendingDeclineIds.has(req.id)}
                    >
                      {pendingAcceptIds.has(req.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5" />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ContactImportModal open={isImportOpen} onOpenChange={setIsImportOpen} />
      
      <FriendProfilePreview
        profile={previewProfile}
        open={!!previewProfile}
        onClose={() => { setPreviewProfile(null); setPreviewFriendshipId(undefined); }}
        friendshipId={previewFriendshipId}
        onRemoveFriend={async (fId) => {
          const { error } = await supabase.from('friendships').delete().eq('id', fId);
          if (error) { toast.error('Failed to remove friend'); return; }
          toast.success('Friend removed');
          queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
        }}
        onBlockUser={async (userId) => {
          const { error } = await supabase.from('blocked_users').insert({ blocker_id: user!.id, blocked_id: userId });
          if (error) { toast.error('Failed to block user'); return; }
          toast.success('User blocked');
          queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
        }}
        onReportUser={async (userId) => {
          const { error } = await supabase.from('reports').insert({ reporter_id: user!.id, target_id: userId, target_type: 'user', reason: 'Reported from friends list' });
          if (error) { toast.error('Failed to report'); return; }
          toast.success('Report submitted');
        }}
      />
    </div>
  );
};

export default Friends;
