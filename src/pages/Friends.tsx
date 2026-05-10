import { useState, useEffect, useMemo } from 'react';
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
  id: string;
  user_id: string; 
  display_name: string;
  username: string;
  avatar_url: string | null;
  friendship_id?: string;
  is_contact?: boolean;
}

const Friends = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { location } = useGeolocation();
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('circle');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();

  // --- 1. DATA QUERIES ---

  // Shared Friendship Query (Single Source of Truth)
  const { data: allFriendships = [] } = useQuery({
    queryKey: ['all_friendships', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(`requester_id.eq.${user?.id},addressee_id.eq.${user?.id}`);
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const acceptedFriendIds = useMemo(() => 
    allFriendships.filter(f => f.status === 'accepted').map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id)
  , [allFriendships, user?.id]);

  const pendingFriendIds = useMemo(() => 
    allFriendships.filter(f => f.status === 'pending').map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id)
  , [allFriendships, user?.id]);

  // Main Friends List
  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['my_friends_list', user?.id, acceptedFriendIds],
    queryFn: async () => {
      if (!acceptedFriendIds.length) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url')
        .in('user_id', acceptedFriendIds);
      
      return (data || []).map(p => ({
        ...p,
        friendship_id: allFriendships.find(f => f.requester_id === p.user_id || f.addressee_id === p.user_id)?.id
      })) as Friend[];
    },
    enabled: !!user?.id && acceptedFriendIds.length > 0
  });

  // Contacts Query
  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts_sync', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('*').eq('user_id', user?.id);
      return data || [];
    },
    enabled: !!user?.id
  });

  // Smart Suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggestions', location?.latitude, user?.id],
    queryFn: async () => {
      const { data: rpcData } = await supabase.rpc('suggest_nearby_friends', {
        requesting_user_id: user?.id,
        user_lat: location?.latitude,
        user_long: location?.longitude,
        limit_count: 8
      });
      return rpcData || [];
    },
    enabled: !!user?.id && !!location,
    staleTime: 600000 // 10 mins
  });

  // Incoming Requests
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('friendships')
        .select('id, created_at, requester:profiles!friendships_requester_id_fkey(id, user_id, display_name, username, avatar_url)')
        .eq('addressee_id', user?.id)
        .eq('status', 'pending');
      return data || [];
    },
    enabled: !!user?.id
  });

  // --- 2. MUTATIONS ---

  const friendshipMutation = useMutation({
    mutationFn: async ({ action, id, targetId }: { action: 'connect' | 'accept' | 'decline' | 'unfriend', id?: string, targetId?: string }) => {
      switch (action) {
        case 'connect': return supabase.from('friendships').insert({ requester_id: user?.id, addressee_id: targetId, status: 'pending' });
        case 'accept': return supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
        case 'decline': 
        case 'unfriend': return supabase.from('friendships').delete().eq('id', id);
      }
    },
    onSuccess: (_, variables) => {
      toast.success(variables.action === 'connect' ? "Request sent!" : "Updated circle");
      queryClient.invalidateQueries({ queryKey: ['all_friendships'] });
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
    },
    onError: () => toast.error("Something went wrong. Please try again.")
  });

  // --- 3. DERIVED LISTS ---

  const filteredFullList = useMemo(() => {
    const appContacts = allContacts
      .filter(c => c.is_app_user && !acceptedFriendIds.includes(c.matched_user_id) && c.matched_user_id !== user?.id)
      .map(c => ({
        user_id: c.matched_user_id,
        display_name: c.name,
        username: 'contact',
        avatar_url: null,
        is_contact: true,
        friendship_id: pendingFriendIds.includes(c.matched_user_id) ? 'pending' : 'contact'
      }));

    const list = [...friends, ...appContacts];
    if (!searchQuery) return list;
    return list.filter(f => f.display_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [friends, allContacts, acceptedFriendIds, pendingFriendIds, searchQuery, user?.id]);

  // --- 4. RENDER HELPERS ---

  const renderFriendAction = (friend: any) => {
    if (friend.friendship_id === 'pending') return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
    if (friend.friendship_id === 'contact') {
      return (
        <Button size="sm" onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: friend.user_id })}>
          <UserPlus className="w-4 h-4 mr-1" /> Add
        </Button>
      );
    }
    return (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={() => navigate(`/app/messages?userId=${friend.user_id}`)}>
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="w-5 h-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setPreviewProfile(friend); setPreviewFriendshipId(friend.friendship_id); }}>View Profile</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => friendshipMutation.mutate({ action: 'unfriend', id: friend.friendship_id })}>Unfriend</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Search Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Friends</h1>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setIsImportOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Sync
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search circle..." 
            className="pl-9 bg-muted/50 border-0 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="circle">My Circle ({friends.length})</TabsTrigger>
            <TabsTrigger value="requests" className="relative">
              Requests {requests.length > 0 && <Badge className="ml-2 bg-red-500">{requests.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="circle" className="space-y-6">
            {/* Suggestions Horizontal Scroll */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Suggested for you
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                  {suggestions.map((s: any) => (
                    <div key={s.user_id} className="min-w-[140px] p-4 bg-card border rounded-2xl text-center space-y-2">
                      <Avatar className="mx-auto h-16 w-16"><AvatarImage src={s.avatar_url} /><AvatarFallback>{s.display_name[0]}</AvatarFallback></Avatar>
                      <p className="text-sm font-bold truncate">{s.display_name}</p>
                      <Button size="sm" className="w-full h-7 text-xs" onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: s.user_id })}>Connect</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div className="space-y-2">
              {filteredFullList.map(friend => (
                <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card border rounded-xl hover:shadow-sm transition-all">
                  <Avatar className="h-12 w-12"><AvatarImage src={friend.avatar_url} /><AvatarFallback>{friend.display_name[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      {friend.display_name}
                      {friend.is_contact && <Badge variant="secondary" className="text-[9px]">Contact</Badge>}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">@{friend.username || 'member'}</p>
                  </div>
                  {renderFriendAction(friend)}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-3">
            {requests.map((req: any) => (
              <div key={req.id} className="flex items-center gap-3 p-4 bg-card border rounded-xl">
                <Avatar><AvatarImage src={req.requester.avatar_url} /><AvatarFallback>{req.requester.display_name[0]}</AvatarFallback></Avatar>
                <div className="flex-1"><h4 className="text-sm font-bold">{req.requester.display_name}</h4><p className="text-xs text-muted-foreground">Sent a request</p></div>
                <div className="flex gap-2">
                  <Button size="icon" variant="outline" className="rounded-full text-red-500" onClick={() => friendshipMutation.mutate({ action: 'decline', id: req.id })}><X className="w-4 h-4" /></Button>
                  <Button size="icon" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => friendshipMutation.mutate({ action: 'accept', id: req.id })}><Check className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
            {requests.length === 0 && <div className="text-center py-20 text-muted-foreground">No pending requests</div>}
          </TabsContent>
        </Tabs>
      </div>

      <ContactImportModal open={isImportOpen} onOpenChange={setIsImportOpen} />
      
      {previewProfile && (
        <FriendProfilePreview
          profile={previewProfile}
          open={!!previewProfile}
          onClose={() => setPreviewProfile(null)}
          friendshipId={previewFriendshipId}
          onRemoveFriend={() => friendshipMutation.mutate({ action: 'unfriend', id: previewFriendshipId })}
        />
      )}
    </div>
  );
};

export default Friends;
