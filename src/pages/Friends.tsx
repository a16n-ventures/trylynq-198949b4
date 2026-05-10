import { useState, useMemo } from 'react';
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
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('circle');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewFriendshipId, setPreviewFriendshipId] = useState<string | undefined>();

  // --- DATA FETCHING ---

  // 1. Single Source of Truth for all friendship statuses
  const { data: allFriendships = [] } = useQuery({
    queryKey: ['all_friendships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(`requester_id.eq.${user?.id},addressee_id.eq.${user?.id}`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Derive accepted IDs for profile filtering
  const acceptedFriendIds = useMemo(() => 
    allFriendships.filter(f => f.status === 'accepted').map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id)
  , [allFriendships, user?.id]);

  // 2. Fetch Profiles for Friends
  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['my_friends_list', user?.id, acceptedFriendIds],
    queryFn: async () => {
      if (acceptedFriendIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, username, avatar_url')
        .in('user_id', acceptedFriendIds);
      
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        friendship_id: allFriendships.find(f => (f.requester_id === p.user_id || f.addressee_id === p.user_id) && f.status === 'accepted')?.id
      })) as Friend[];
    },
    enabled: !!user?.id && acceptedFriendIds.length > 0
  });

  // 3. Sync Contacts
  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts_sync', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('*').eq('user_id', user?.id);
      return data || [];
    },
    enabled: !!user?.id
  });

  // 4. Nearby Suggestions
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

  // 5. Incoming Requests
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

  // --- UNIFIED MUTATION LOGIC ---
  const friendshipMutation = useMutation({
    mutationFn: async ({ action, id, targetId }: { action: 'connect' | 'accept' | 'decline' | 'unfriend' | 'block' | 'report', id?: string, targetId?: string }) => {
      switch (action) {
        case 'connect':
          return supabase.from('friendships').insert({ requester_id: user?.id, addressee_id: targetId, status: 'pending' });
        case 'accept':
          return supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
        case 'decline':
        case 'unfriend':
          return supabase.from('friendships').delete().eq('id', id);
        case 'block':
          return supabase.from('blocked_users').insert({ blocker_id: user?.id, blocked_id: targetId });
        case 'report':
          return supabase.from('reports').insert({ reporter_id: user?.id, target_id: targetId, target_type: 'user', reason: 'Reported from list' });
      }
    },
    onSuccess: (_, variables) => {
      const messages = { connect: "Request sent!", accept: "Request accepted!", decline: "Request declined", unfriend: "Friend removed", block: "User blocked", report: "Report submitted" };
      toast.success(messages[variables.action]);
      queryClient.invalidateQueries({ queryKey: ['all_friendships'] });
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
      queryClient.invalidateQueries({ queryKey: ['my_friends_list'] });
    },
    onError: () => toast.error("Action failed. Please try again.")
  });

  // --- DERIVED SEARCH LIST ---
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
      {/* Header & Search */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
          <Button size="sm" variant="outline" className="rounded-full bg-primary/5 border-primary/20 text-primary hover:bg-primary/10" onClick={() => setIsImportOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Sync Contacts
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search your circle..." 
            className="pl-9 bg-muted/50 border-0 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6 p-1 bg-muted/50 rounded-xl">
            <TabsTrigger value="circle" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              My Circle ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm relative">
              Requests
              {requests.length > 0 && (
                <Badge className="ml-2 bg-red-500 hover:bg-red-500 text-[10px] h-4 w-4 p-0 flex items-center justify-center">
                  {requests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="circle" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Horizontal Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    People you may know
                  </h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                  {suggestions.map((s: any) => (
                    <div key={s.user_id} className="min-w-[140px] p-4 bg-card border border-border/50 rounded-2xl text-center space-y-3 shadow-sm">
                      <Avatar className="mx-auto h-16 w-16 border-2 border-background shadow-sm">
                        <AvatarImage src={s.avatar_url} />
                        <AvatarFallback className="bg-primary/5 text-primary">{s.display_name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <p className="text-sm font-bold truncate px-1">{s.display_name}</p>
                        <p className="text-[10px] text-muted-foreground">Nearby</p>
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full h-8 rounded-lg text-xs font-medium"
                        onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: s.user_id })}
                        disabled={friendshipMutation.isPending}
                      >
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List */}
            <div className="space-y-2">
              {filteredFullList.map((friend) => (
                <div key={friend.user_id} className="group flex items-center gap-3 p-3 bg-card border border-border/40 rounded-2xl hover:border-primary/20 hover:shadow-sm transition-all duration-200">
                  <Avatar className="h-12 w-12 border border-border/50">
                    <AvatarImage src={friend.avatar_url} />
                    <AvatarFallback>{friend.display_name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm truncate">{friend.display_name}</h4>
                      {friend.is_contact && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/5 text-primary border-none uppercase font-bold">Contact</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                  </div>
                  
                  {friend.friendship_id === 'pending' ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 animate-pulse text-[10px]">Pending</Badge>
                  ) : friend.friendship_id === 'contact' ? (
                    <Button size="sm" className="h-8 rounded-lg px-4" onClick={() => friendshipMutation.mutate({ action: 'connect', targetId: friend.user_id })}>
                      Add
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => navigate(`/app/messages?userId=${friend.user_id}`)}>
                        <MessageCircle className="w-5 h-5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-muted-foreground">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl p-1">
                          <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setPreviewProfile(friend); setPreviewFriendshipId(friend.friendship_id); }}>
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-lg py-2 text-red-600 focus:text-red-600 cursor-pointer" onClick={() => friendshipMutation.mutate({ action: 'unfriend', id: friend.friendship_id })}>
                            <UserMinus className="w-4 h-4 mr-2" />
                            Unfriend
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {requests.map((req: any) => (
              <div key={req.id} className="flex items-center gap-3 p-4 bg-card border border-border/40 rounded-2xl shadow-sm">
                <Avatar className="h-12 w-12 border border-border/50">
                  <AvatarImage src={req.requester.avatar_url} />
                  <AvatarFallback>{req.requester.display_name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold truncate">{req.requester.display_name}</h4>
                  <p className="text-xs text-muted-foreground truncate">Sent a request</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-9 w-9 rounded-full border-red-100 text-red-500 hover:bg-red-50" onClick={() => friendshipMutation.mutate({ action: 'decline', id: req.id })}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="icon" className="h-9 w-9 rounded-full bg-green-600 hover:bg-green-700 shadow-sm" onClick={() => friendshipMutation.mutate({ action: 'accept', id: req.id })}>
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <div className="text-center py-20 space-y-4">
                <div className="bg-muted/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">No pending requests at the moment</p>
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
