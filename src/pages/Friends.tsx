import { useState, useEffect } from 'react';
import { 
  Search, UserPlus, Users, MessageCircle, MoreVertical, 
  X, Check, Loader2, Phone, Share2, UserMinus,
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
  const [isEditingCity, setIsEditingCity] = useState(false);
  const [manualCityInput, setManualCityInput] = useState('');

  // Fallback state context for off-app mock variables
  const rawImportedContacts: any[] = [];

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
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (error) throw error;
      if (!data) return [];

      const userIds = new Set<string>();
      data.forEach((f: any) => {
        userIds.add(f.requester_id);
        userIds.add(f.addressee_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url')
        .in('user_id', Array.from(userIds));

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      return data
        .map((f: any) => {
          const isRequester = f.requester_id === user.id;
          const otherId = isRequester ? f.addressee_id : f.requester_id;
          const profile = profileMap.get(otherId);
          
          if (!profile) return null;

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
    },
    enabled: !!user?.id,
  });
  
  useEffect(() => {
    if (friendsError) {
      toast.error(friendsError instanceof Error ? friendsError.message : 'Failed to load friends');
    }
  }, [friendsError]);

  // B. Fetch Imported Contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ['app_contacts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data: myContacts } = await supabase
        .from('contacts')
        .select('matched_user_id, name')
        .eq('user_id', user.id)
        .eq('is_app_user', true)
        .not('matched_user_id', 'is', null);
  
      if (!myContacts?.length) return [];
  
      const contactUserIds = myContacts.map(c => c.matched_user_id);
      
      const { data: existingFriends } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      
      const friendIds = existingFriends?.map((f: any) => 
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      ) || [];
      
      const newContactIds = contactUserIds.filter(id => !friendIds.includes(id) && id !== user.id);
  
      if (newContactIds.length === 0) return [];
  
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url')
        .in('user_id', newContactIds);
  
      return (profiles || []).map((p: any) => ({
        ...p,
        is_contact: true,
        display_name: myContacts.find(c => c.matched_user_id === p.user_id)?.name || p.display_name
      }));
    },
    enabled: !!user?.id,
  });

  // C. Fetch Smart Suggestions
  const [resolvedCity, setResolvedCity] = useState<string>('');
  useEffect(() => {
    if (!location?.latitude || !location?.longitude || resolvedCity) return;
    let cancelled = false;
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`,
      { headers: { 'User-Agent': 'Ahmia-App' } }
    )
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const city = d?.address?.city || d?.address?.town || d?.address?.county || d?.address?.state || '';
        setResolvedCity(city);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [location?.latitude, location?.longitude, resolvedCity]);

  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ['friend_suggestions', user?.id, location?.latitude, location?.longitude, resolvedCity],
    queryFn: async () => {
      if (!user?.id) return [];

      if (location?.latitude && location?.longitude) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('suggest_nearby_friends', {
          p_user_id: user.id,
          p_lat: location.latitude,
          p_long: location.longitude,
          p_city: resolvedCity || '',
          p_is_premium: false,
        });
        
        if (!rpcError && rpcData?.length) {
          return (rpcData as any[]).map(s => ({
            user_id: s.id,           
            display_name: s.display_name || 'User',
            username: s.username || 'user',
            avatar_url: s.avatar_url ?? null,
            distance_km: typeof s.distance_km === 'number' ? s.distance_km : undefined,
            mutual_count: typeof s.mutual_count === 'number' ? s.mutual_count : parseInt(s.mutual_count || '0', 10),
            is_new: !!s.is_new_user,
            common_interests: Array.isArray(s.common_interests) ? s.common_interests : [],
          } as Suggestion));
        }
      }

      const { data: existingFriends } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const excludeIds = new Set([
        user.id,
        ...(existingFriends || []).map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id),
      ]);

      const { data: fallback } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url, created_at')
        .not('user_id', 'in', `(${Array.from(excludeIds).join(',')})`)
        .order('created_at', { ascending: false })
        .limit(8);

      return (fallback || []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name || 'User',
        username: p.username || 'user',
        avatar_url: p.avatar_url ?? null,
        is_new: new Date(p.created_at) > new Date(Date.now() - 7 * 86400000),
      } as Suggestion));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // D. Fetch Requests
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('friendships')
        .select('id, created_at, requester_id')
        .eq('addressee_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

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
    },
    enabled: !!user?.id
  });

  // --- 2. ACTIONS ---
  const handleConnect = useMutation({
    onMutate: (targetId: string) => {
      setPendingConnectIds(prev => new Set(prev).add(targetId));
    },
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('friendships').insert({
        requester_id: user?.id,
        addressee_id: targetId,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: (_data, targetId) => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friend_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['app_contacts'] });
    },
    onError: (err: Error, targetId) => {
      setPendingConnectIds(prev => { const s = new Set(prev); s.delete(targetId); return s; });
      toast.error(err.message || 'Could not send request');
    },
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

  const searchLower = searchQuery.toLowerCase();

  const filteredFriends = friends.filter(f => 
    f.display_name?.toLowerCase().includes(searchLower) || 
    f.username?.toLowerCase().includes(searchLower)
  );

  const filteredAppContacts = contacts
    .map(c => ({ 
      ...c, 
      id: c.user_id || c.id, 
      friendship_id: 'contact',
      is_contact: true,
      display_name: c.display_name || c.name || 'Contact'
    } as Friend))
    .filter(f => 
      f.display_name?.toLowerCase().includes(searchLower) || 
      f.username?.toLowerCase().includes(searchLower)
    );

  const filteredInvites = rawImportedContacts
    .filter(c => !c.is_app_user && !c.matched_user_id)
    .map(c => ({
      id: c.id,
      user_id: c.id,
      display_name: c.name,
      username: c.username || c.phone || '',
      avatar_url: null,
      friendship_id: 'imported',
      is_contact: true,
    } as Friend))
    .filter(f => 
      f.display_name?.toLowerCase().includes(searchLower) || 
      f.username?.toLowerCase().includes(searchLower)
    );

  const handleInviteShare = async (contact: Friend) => {
    const inviteUrl = `/u/${user?.id}`;
    const messageText = `Hey ${contact.display_name}, join my circle on Ahmia! Download here: ${inviteUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Ahmia', text: messageText, url: inviteUrl });
      } catch (err) {
        console.warn('Share dismissed:', err);
      }
    } else {
      window.open(`sms:${contact.username}?body=${encodeURIComponent(messageText)}`);
    }
  };

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
            
            {/* 1. SUGGESTIONS CAROUSEL */}
            {(loadingSuggestions || suggestions.length > 0) && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3 px-1 gap-2">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    <span className="truncate">
                      {location ? `Near ${resolvedCity || 'People nearby'}` : 'Suggested for you'}
                    </span>
                  </h3>

                  {!location && (
                    <div className="text-xs shrink-0">
                      {isEditingCity ? (
                        <div className="flex gap-1 items-center">
                          <Input 
                            placeholder="Type city..." 
                            className="h-7 text-xs w-28 bg-muted border-0 rounded-lg focus-visible:ring-1"
                            value={manualCityInput}
                            onChange={(e) => setManualCityInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && manualCityInput.trim()) {
                                setResolvedCity(manualCityInput.trim());
                                setIsEditingCity(false);
                              }
                            }}
                          />
                          <Button 
                            size="sm" 
                            className="h-7 px-2 text-xs" 
                            onClick={() => {
                              if (manualCityInput.trim()) setResolvedCity(manualCityInput.trim());
                              setIsEditingCity(false);
                            }}
                          >
                            Set
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          variant="ghost" 
                          className="h-7 px-2 text-xs text-primary bg-primary/5 hover:bg-primary/10 rounded-lg flex items-center gap-1"
                          onClick={() => setIsEditingCity(true)}
                        >
                          <MapPin className="w-3 h-3" /> 
                          {resolvedCity ? resolvedCity : 'Set City'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                  {loadingSuggestions
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="min-w-[150px] w-[150px] p-3 rounded-2xl border bg-card/50 flex flex-col items-center text-center shadow-sm animate-pulse">
                          <div className="h-16 w-16 rounded-full bg-muted mb-2" />
                          <div className="h-3 w-20 bg-muted rounded mb-1" />
                          <div className="h-2 w-12 bg-muted rounded mb-3" />
                          <div className="h-8 w-full bg-muted rounded-lg" />
                        </div>
                      ))
                    : suggestions.map((s) => {
                        const sent = pendingConnectIds.has(s.user_id);
                        const commonInterests = (s as any).common_interests as string[] | undefined;
                        return (
                          <div key={s.user_id} className="min-w-[150px] w-[150px] p-3 rounded-2xl border bg-card/50 flex flex-col items-center text-center shadow-sm relative hover:border-primary/50 transition-all mt-2">
                            {s.is_new && (
                              <Badge className="absolute -top-1 -right-1 bg-blue-500 hover:bg-blue-600 border-none px-1.5 py-0 text-[9px] h-4">
                                NEW
                              </Badge>
                            )}

                            <Avatar className="h-16 w-16 mb-2 border-2 border-background shadow-md">
                              <AvatarImage src={s.avatar_url || undefined} />
                              <AvatarFallback>{s.display_name?.[0] ?? '?'}</AvatarFallback>
                            </Avatar>

                            <h4 className="font-bold text-sm truncate w-full">{s.display_name}</h4>
                            <p className="text-[10px] text-muted-foreground truncate w-full mb-1">@{s.username}</p>

                            {s.distance_km != null && (
                              <p className="text-[10px] font-bold text-primary flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" /> {s.distance_km.toFixed(1)}km away
                              </p>
                            )}

                            {(s.mutual_count ?? 0) > 0 && (
                              <p className="text-[9px] text-muted-foreground">
                                {s.mutual_count} mutual {s.mutual_count === 1 ? 'friend' : 'friends'}
                              </p>
                            )}

                            {commonInterests && commonInterests.length > 0 && (
                              <div className="flex flex-wrap justify-center gap-1 mt-1">
                                {commonInterests.slice(0, 2).map(tag => (
                                  <span key={tag} className="text-[9px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <Button
                              size="sm"
                              className="w-full h-8 text-xs rounded-lg mt-3"
                              onClick={() => !sent && handleConnect.mutate(s.user_id)}
                              disabled={sent}
                            >
                              {sent ? 'Sent ✓' : 'Connect'}
                            </Button>
                          </div>
                        );
                      })}
                </div>
              </div>
            )} 

            {/* 2. MAIN LIST SEGMENTS */}
            {friendsError ? (
              <div className="text-center py-12 text-destructive border-2 border-dashed border-destructive/50 rounded-xl bg-destructive/5">
                <h3 className="font-semibold mb-2">Failed to load friends</h3>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['my_friends_page'] })}>
                  Try Again
                </Button>
              </div>
            ) : loadingFriends ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredFriends.length === 0 && filteredAppContacts.length === 0 && filteredInvites.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No connections found.</p>
                <Button variant="link" onClick={() => setIsImportOpen(true)}>Sync Contacts</Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => setIsImportOpen(true)}>
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-sm">Find from contacts</h4>
                        <p className="text-xs text-muted-foreground">Sync your raw device address book</p>
                    </div>
                    <Check className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* SEGMENT 1: TRUE CIRCLE */}
                {filteredFriends.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-muted-foreground px-1 uppercase tracking-wider mb-1">
                        My Circle ({filteredFriends.length})
                    </div>
                    {filteredFriends.map(friend => (
                      <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border shadow-sm group hover:shadow-md transition-shadow">
                        <Avatar className="h-12 w-12 cursor-pointer" onClick={() => openProfilePreview(friend)}>
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback>{friend.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openProfilePreview(friend)}>
                          <h4 className="font-semibold text-sm truncate">{friend.display_name}</h4>
                          <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="rounded-full h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => navigate(`/app/messages?userId=${friend.user_id}`)}>
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SEGMENT 2: ON APP */}
                {filteredAppContacts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400 px-1 uppercase tracking-wider mb-1">
                        Contacts Already on Ahmia ({filteredAppContacts.length})
                    </div>
                    {filteredAppContacts.map(friend => (
                      <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border shadow-sm border-blue-100 dark:border-blue-900/30">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback>{friend.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                              {friend.display_name}
                              <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-blue-50 text-blue-600 border-blue-200">Phone Match</Badge>
                          </h4>
                          <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                        </div>

                        <Button size="sm" variant="default" className="h-8 px-3 bg-blue-600 hover:bg-blue-700" onClick={() => handleConnect.mutate(friend.user_id)} disabled={pendingConnectIds.has(friend.user_id)}>
                          {pendingConnectIds.has(friend.user_id) ? 'Sent ✓' : <><UserPlus className="w-3.5 h-3.5 mr-1" /> Add</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* SEGMENT 3: INVITES */}
                {filteredInvites.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-muted-foreground px-1 uppercase tracking-wider mb-1">
                        Invite to App ({filteredInvites.length})
                    </div>
                    {filteredInvites.map(contact => (
                      <div key={contact.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-dashed opacity-80">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
                          {contact.display_name?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate text-muted-foreground">{contact.display_name}</h4>
                          <p className="text-xs text-muted-foreground/60 truncate">{contact.username}</p>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 px-3 border-primary/30 text-primary hover:bg-primary/5 gap-1" onClick={() => handleInviteShare(contact)}>
                          <Share2 className="w-3.5 h-3.5" /> Invite
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* REQUESTS TAB */}
          <TabsContent value="requests" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            {loadingRequests ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : requests.length === 0 ? (
              <div className="text-center py-16 bg-muted/20 rounded-2xl border-2 border-dashed border-muted">
                <h3 className="font-semibold">No pending requests</h3>
                <Button variant="link" className="mt-2" onClick={() => { navigator.clipboard.writeText(`/u/${user?.id}`); toast.success("Link copied!"); }}>
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
                    <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDecline.mutate(req.id)} disabled={pendingDeclineIds.has(req.id) || pendingAcceptIds.has(req.id)}>
                      {pendingDeclineIds.has(req.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-5 h-5" />}
                    </Button>
                    <Button size="sm" className="h-9 w-9 p-0 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={() => handleAccept.mutate(req.id)} disabled={pendingAcceptIds.has(req.id) || pendingDeclineIds.has(req.id)}>
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
          await supabase.from('friendships').delete().eq('id', fId);
          queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
        }}
        onBlockUser={async (userId) => {
          await supabase.from('blocked_users').insert({ blocker_id: user!.id, blocked_id: userId });
          queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
        }}
        onReportUser={async (userId) => {
          await supabase.from('reports').insert({ reporter_id: user!.id, target_id: userId, target_type: 'user', reason: 'Reported from friends list' });
          toast.success('Report submitted');
        }}
      />
    </div>
  );
};

export default Friends;
