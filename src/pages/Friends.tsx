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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useGeolocation } from '@/contexts/LocationContext';

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

  // --- 1. FETCH DATA ---

  // A. Fetch My Friends (Confirmed)
  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['my_friends_page', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          requester:profiles!requester_id(id, user_id, display_name, username, avatar_url),
          addressee:profiles!addressee_id(id, user_id, display_name, username, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (error) throw error;

      return data.map((f: any) => {
        const isRequester = f.requester.user_id === user.id;
        const profile = isRequester ? f.addressee : f.requester;
        return {
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name || 'User',
          username: profile.username || 'user',
          avatar_url: profile.avatar_url,
          friendship_id: f.id,
          is_contact: false
        };
      });
    },
    enabled: !!user
  });

  // B. Fetch Imported Contacts (Who are on App but NOT friends yet)
  const { data: contacts = [] } = useQuery({
    queryKey: ['app_contacts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // 1. Get contacts marked as app users
      const { data: myContacts } = await supabase
        .from('contacts')
        .select('matched_user_id, name')
        .eq('user_id', user.id)
        .eq('is_app_user', true)
        .not('matched_user_id', 'is', null);

      if (!myContacts?.length) return [];

      const contactUserIds = myContacts.map(c => c.matched_user_id);
      
      // 2. Filter out existing friends
      const friendIds = friends.map(f => f.user_id);
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
        display_name: myContacts.find(c => c.matched_user_id === p.user_id)?.name || p.display_name // Prefer contact name
      }));
    },
    enabled: !!user && friends.length > 0 // Only run after friends loaded to diff
  });

  // C. Fetch Smart Suggestions (Nearby & Mutuals)
  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ['friend_suggestions', user?.id, location?.latitude],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        // Try RPC first (if available and location ready)
        if (location) {
            const { data: rpcData, error } = await supabase.rpc('suggest_nearby_friends', {
                requesting_user_id: user.id,
                user_lat: location.latitude,
                user_long: location.longitude,
                limit_count: 5
            });
            if (!error && rpcData && rpcData.length > 0) {
                 return rpcData.map((s: any) => ({
                     user_id: s.friend_id || s.user_id,
                     display_name: s.display_name,
                     username: 'suggested',
                     avatar_url: s.avatar_url,
                     distance_km: s.distance_km,
                     score: s.score
                 }));
            }
        }

        // Fallback: Random profiles not me and not friends
        const friendIds = friends.map(f => f.user_id);
        const { data: randomData } = await supabase
            .from('profiles')
            .select('user_id, display_name, username, avatar_url, location')
            .neq('user_id', user.id)
            .not('user_id', 'in', `(${friendIds.join(',')})`)
            .limit(5);

        return (randomData || []).map((p: any) => ({
            ...p,
            distance_km: null, // Unknown
            mutual_count: Math.floor(Math.random() * 3) // Simulated mutuals for demo
        }));
      } catch (e) {
        console.error("Suggestion fetch failed", e);
        return [];
      }
    },
    enabled: !!user
  });

  // D. Fetch Requests
  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['friend_requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('friendships')
        .select(`
          id, created_at,
          requester:profiles!requester_id(id, user_id, display_name, username, avatar_url)
        `)
        .eq('addressee_id', user.id)
        .eq('status', 'pending');
      return data as Request[];
    },
    enabled: !!user
  });

  // --- 2. ACTIONS ---

  const handleConnect = useMutation({
    mutationFn: async (targetId: string) => {
        const { error } = await supabase.from('friendships').insert({
            requester_id: user?.id,
            addressee_id: targetId,
            status: 'pending'
        });
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Friend request sent!");
        queryClient.invalidateQueries({ queryKey: ['friend_suggestions'] }); // Refresh suggestions
        queryClient.invalidateQueries({ queryKey: ['app_contacts'] });
    },
    onError: () => toast.error("Could not send request")
  });

  const handleAccept = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Friend added!");
      queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
      queryClient.invalidateQueries({ queryKey: ['my_friends_page'] });
    },
    onError: () => toast.error("Failed")
  });

  const handleDecline = useMutation({
    mutationFn: async (friendshipId: string) => {
        await supabase.from('friendships').delete().eq('id', friendshipId);
    },
    onSuccess: () => {
        toast.success("Request removed");
        queryClient.invalidateQueries({ queryKey: ['friend_requests'] });
    }
  });

  // Combined list for display (Friends + Contacts)
  const allContactsList = [
      ...friends,
      ...contacts.map(c => ({ ...c, id: c.user_id, friendship_id: 'contact' })) 
  ];

  const filteredList = allContactsList.filter(f => 
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
            <TabsTrigger value="requests" className="rounded-lg relative">
              Requests
              {requests.length > 0 && (
                <Badge className="ml-2 h-5 w-5 rounded-full px-0 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white">
                  {requests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* MY CIRCLE TAB */}
          <TabsContent value="circle" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            
            {/* 1. SUGGESTIONS (If friends < 10 or always show lightly) */}
            {suggestions.length > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" /> People nearby
                        </h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                        {suggestions.map((s) => (
                            <div key={s.user_id} className="min-w-[140px] w-[140px] p-3 rounded-xl border bg-card flex flex-col items-center text-center shadow-sm relative">
                                <Avatar className="h-14 w-14 mb-2 border-2 border-background shadow-sm">
                                    <AvatarImage src={s.avatar_url || undefined} />
                                    <AvatarFallback>{s.display_name[0]}</AvatarFallback>
                                </Avatar>
                                <h4 className="font-bold text-sm truncate w-full">{s.display_name}</h4>
                                {s.distance_km ? (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-3">
                                        <MapPin className="w-2.5 h-2.5" /> {s.distance_km.toFixed(1)}km away
                                    </p>
                                ) : s.mutual_count ? (
                                    <p className="text-[10px] text-muted-foreground mb-3">{s.mutual_count} mutual friends</p>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground mb-3">Suggested</p>
                                )}
                                <Button 
                                    size="sm" 
                                    className="w-full h-8 text-xs rounded-lg"
                                    onClick={() => handleConnect.mutate(s.user_id)}
                                >
                                    Connect
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. MAIN LIST */}
            {loadingFriends ? (
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
                  <div key={friend.user_id} className="flex items-center gap-3 p-3 bg-card rounded-xl border shadow-sm group">
                    <Avatar className="h-12 w-12 cursor-pointer" onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>{friend.display_name[0]}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
                      <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                          {friend.display_name}
                          {friend.is_contact && <Badge variant="secondary" className="text-[10px] h-4 px-1">From Contacts</Badge>}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      {friend.is_contact ? (
                          <Button size="sm" variant="secondary" className="h-8 px-3" onClick={() => handleConnect.mutate(friend.user_id)}>
                              <UserPlus className="w-4 h-4 mr-1.5" /> Add
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
                                <DropdownMenuItem onClick={() => navigate(`/app/profile?id=${friend.user_id}`)}>
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
              <div className="text-center py-16 bg-muted/20 rounded-2xl border-2 border-dashed">
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
                    <AvatarFallback>{req.requester.display_name[0]}</AvatarFallback>
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
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-9 w-9 p-0 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-sm"
                      onClick={() => handleAccept.mutate(req.id)}
                    >
                      <Check className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ContactImportModal open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
  );
};

export default Friends;
