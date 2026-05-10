import { useState, useMemo } from 'react';
import { 
  Search, UserPlus, Users, MessageCircle, MoreVertical, 
  X, Check, Loader2, Phone, Share2, UserMinus,
  MapPin, Sparkles, QrCode, Rocket, Globe
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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('circle');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();

  // --- OPTIMIZED DATA FETCHING ---
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
  });

  const acceptedFriendIds = useMemo(() => 
    allFriendships.filter(f => f.status === 'accepted').map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id)
  , [allFriendships, user?.id]);

  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['my_friends_list', user?.id, acceptedFriendIds],
    queryFn: async () => {
      if (acceptedFriendIds.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url')
        .in('user_id', acceptedFriendIds);
      return (data || []).map(p => ({
        ...p,
        friendship_id: allFriendships.find(f => (f.requester_id === p.user_id || f.addressee_id === p.user_id) && f.status === 'accepted')?.id
      })) as Friend[];
    },
    enabled: !!user?.id && acceptedFriendIds.length > 0
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts_sync', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('*').eq('user_id', user?.id);
      return data || [];
    },
    enabled: !!user?.id
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggestions', location?.latitude, user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('suggest_nearby_friends', {
        requesting_user_id: user?.id,
        user_lat: location?.latitude,
        user_long: location?.longitude,
        limit_count: 8
      });
      return data || [];
    },
    enabled: !!user?.id && !!location
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('friendships')
        .select('id, requester:profiles!friendships_requester_id_fkey(id, user_id, display_name, username, avatar_url)')
        .eq('addressee_id', user?.id)
        .eq('status', 'pending');
      return data || [];
    },
    enabled: !!user?.id
  });

  // --- UNIFIED LOGIC ---
  const friendshipMutation = useMutation({
    mutationFn: async ({ action, id, targetId }: { action: 'connect' | 'accept' | 'decline' | 'unfriend' | 'block' | 'report', id?: string, targetId?: string }) => {
      switch (action) {
        case 'connect': return supabase.from('friendships').insert({ requester_id: user?.id, addressee_id: targetId, status: 'pending' });
        case 'accept': return supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
        case 'decline': case 'unfriend': return supabase.from('friendships').delete().eq('id', id);
        case 'block': return supabase.from('blocked_users').insert({ blocker_id: user?.id, blocked_id: targetId });
        case 'report': return supabase.from('reports').insert({ reporter_id: user?.id, target_id: targetId, target_type: 'user', reason: 'Reported from list' });
      }
    },
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['all_friendships'] });
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
      queryClient.invalidateQueries({ queryKey: ['my_friends_list'] });
    }
  });

  const filteredFullList = useMemo(() => {
    const pendingTargetIds = allFriendships.filter(f => f.status === 'pending' && f.requester_id === user?.id).map(f => f.addressee_id);
    const appContacts = allContacts
      .filter(c => c.is_app_user && !acceptedFriendIds.includes(c.matched_user_id) && c.matched_user_id !== user?.id)
      .map(c => ({
        user_id: c.matched_user_id,
        display_name: c.name,
        username: 'contact',
        avatar_url: null,
        is_contact: true,
        friendship_id: pendingTargetIds.includes(c.matched_user_id) ? 'pending' : 'contact'
      }));
    const combined = [...friends, ...appContacts];
    if (!searchQuery) return combined;
    return combined.filter(f => f.display_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [friends, allContacts, acceptedFriendIds, allFriendships, searchQuery, user?.id]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Friends</h1>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setIsImportOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Sync Contacts
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search your circle..." 
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
            {/* SUGGESTIONS CARD UI - RESTORED */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" /> People you may know
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                  {suggestions.map((s: any) => (
                    <div key={s.user_id} className="min-w-[140px] p-4 bg-card border rounded-2xl text-center space-y-3 relative overflow-hidden group">
                      <div className="absolute top-2 right-2">
                        {s.distance < 5000 ? <Rocket className="w-3 h-3 text-primary/40" /> : <Globe className="w-3 h-3 text-primary/40" />}
                      </div>
                      <Avatar className="mx-auto h-16 w-16">
                        <AvatarImage src={s.avatar_url} />
                        <AvatarFallback>{s.display_name[0]}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-bold truncate">{s.display_name}</p>
                      <Button size="sm" className="w-full h-8" onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: s.user_id })}>
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FRIENDS LIST UI - RESTORED */}
            <div className="space-y-2">
              {filteredFullList.map((friend) => (
                <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card border rounded-2xl hover:shadow-sm transition-all">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={friend.avatar_url} />
                    <AvatarFallback>{friend.display_name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                      {friend.display_name}
                      {friend.is_contact && <Badge variant="secondary" className="text-[9px] bg-primary/5 text-primary border-none">Contact</Badge>}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                  </div>
                  
                  {friend.friendship_id === 'pending' ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>
                  ) : friend.friendship_id === 'contact' ? (
                    <Button size="sm" className="h-8 rounded-lg" onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: friend.user_id })}>
                      Add
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
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
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-3">
            {requests.map((req: any) => (
              <div key={req.id} className="flex items-center gap-3 p-4 bg-card border rounded-2xl shadow-sm">
                <Avatar className="h-12 w-12"><AvatarImage src={req.requester.avatar_url} /><AvatarFallback>{req.requester.display_name?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0"><h4 className="text-sm font-bold">{req.requester.display_name}</h4><p className="text-xs text-muted-foreground">Sent a request</p></div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="rounded-full text-red-500" onClick={() => friendshipMutation.mutate({ action: 'decline', id: req.id })}><X className="w-4 h-4" /></Button>
                  <Button size="icon" className="rounded-full bg-green-600 hover:bg-green-700" onClick={() => friendshipMutation.mutate({ action: 'accept', id: req.id })}><Check className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
            {/* REQUEST EMPTY STATE - RESTORED */}
            {requests.length === 0 && (
              <div className="text-center py-20 space-y-4">
                <div className="bg-muted/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">No pending requests</p>
                  <p className="text-xs text-muted-foreground">Discover people around you to add to your circle</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('circle')} className="rounded-full px-6">
                  Find Friends
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ContactImportModal open={isImportOpen} onOpenChange={setIsImportOpen} />
      
      {previewProfile && (
        <FriendProfilePreview
          profile={previewProfile}
          open={!!previewProfile}
          onClose={() => { setPreviewProfile(null); setPreviewFriendshipId(undefined); }}
          friendshipId={previewFriendshipId}
          onRemoveFriend={() => friendshipMutation.mutate({ action: 'unfriend', id: previewFriendshipId })}
          onBlockUser={() => friendshipMutation.mutate({ action: 'block', targetId: previewProfile.user_id })}
          onReportUser={() => friendshipMutation.mutate({ action: 'report', targetId: previewProfile.user_id })}
        />
      )}
    </div>
  );
};

export default Friends;
