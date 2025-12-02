import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, MapPin, Users, MessageCircle, Plus, Settings, Search, Crown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'; // Import useQuery

// --- Types ---
interface Friend {
  id: string;
  name: string;
  avatar: string;
  location: string;
  distance: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
}
interface DashboardStats {
  nearby: number;
  messages: number;
  events: number;
}
interface DashboardData {
  stats: DashboardStats;
  nearbyFriends: Friend[];
}

// --- Helper: Data Fetching Function ---
const fetchDashboardData = async (userId: string): Promise<DashboardData> => {
  // 1. Get friend IDs first
  const { data: friendships, error: friendErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  
  if (friendErr) throw friendErr;

  const friendIds = friendships?.map(f => 
    f.requester_id === userId ? f.addressee_id : f.requester_id
  ) || [];

  // 2. Define queries to run in parallel
  let friendsQuery = Promise.resolve({ data: [] as Friend[] });
  if (friendIds.length > 0) {
    friendsQuery = (async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', friendIds);
      
      const { data: locations } = await supabase
        .from('user_locations')
        .select('user_id, latitude, longitude, is_sharing_location')
        .in('user_id', friendIds)
        .eq('is_sharing_location', true);

      // Merge data (this logic can be improved with distance calc)
      return {
        data: (profiles || []).map(profile => {
          const location = locations?.find(l => l.user_id === profile.user_id);
          return {
            id: profile.user_id,
            name: profile.display_name || 'Friend',
            avatar: profile.avatar_url || '',
            location: location ? 'Nearby' : 'Unknown',
            distance: location ? '< 5 miles' : 'N/A',
            status: 'online' as const, // TODO: Integrate presence
            lastSeen: 'Active now'
          };
        }).slice(0, 3) // Only take top 3 for dashboard
      };
    })();
  }

  const msgQuery = supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null);

  const eventQuery = supabase
    .from('event_attendees')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // 3. Run all in parallel
  const [
    { data: friendsData },
    { count: msgCount, error: msgError },
    { count: eventCount, error: eventError },
  ] = await Promise.all([friendsQuery, msgQuery, eventQuery]);

  if (msgError) throw msgError;
  if (eventError) throw eventError;

  // 4. Return combined data
  return {
    stats: {
      nearby: friendIds.length,
      messages: msgCount || 0,
      events: eventCount || 0,
    },
    nearbyFriends: friendsData || [],
  };
};

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  // --- Data Fetching with useQuery ---
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: () => fetchDashboardData(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60, // Cache for 1 minute
  });

  // Handle error with useEffect
  if (error) {
    toast.error('Failed to load dashboard: ' + (error as Error).message);
  }
  
  const stats = data?.stats || { nearby: 0, messages: 0, events: 0 };
  const nearbyFriends = data?.nearbyFriends || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="status-online text-xs">Online</Badge>;
      case 'away':
        return <Badge className="status-away text-xs">Away</Badge>;
      default:
        return <Badge className="status-offline text-xs">Offline</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="gradient-primary text-white">
        <div className="container-mobile py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="heading-lg text-white">Welcome back!</h1>
              <p className="opacity-90">Discover who's nearby</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 p-2">
                <Bell className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-white hover:bg-white/20 p-2"
                onClick={() => navigate('/premium')}
              >
                <Crown className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 p-2">
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
            <Input
              placeholder="Search friends or places..."
              className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-white/70"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container-mobile py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="gradient-card shadow-card border-0">
            <CardContent className="p-4 text-center">
              <div className="gradient-primary text-white w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold">{stats.nearby}</div>
              <div className="text-xs text-muted-foreground">Friends</div>
            </CardContent>
          </Card>
          
          <Card className="gradient-card shadow-card border-0">
            <CardContent className="p-4 text-center">
              <div className="gradient-secondary text-white w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold">{stats.messages}</div>
              <div className="text-xs text-muted-foreground">Messages</div>
            </CardContent>
          </Card>
          
          <Card className="gradient-card shadow-card border-0">
            <CardContent className="p-4 text-center">
              <div className="bg-accent text-white w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold">{stats.events}</div>
              <div className="text-xs text-muted-foreground">Events</div>
            </CardContent>
          </Card>
        </div>

        {/* Nearby Friends */}
        <Card className="gradient-card shadow-card border-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="heading-lg">Friends Nearby</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate('/app/friends')}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-4">Loading friends...</p>
            ) : nearbyFriends.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No friends nearby yet. Add some friends!</p>
            ) : (
              nearbyFriends.map((friend) => (
              <div key={friend.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-smooth">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={friend.avatar} />
                  <AvatarFallback className="gradient-primary text-white">
                    {friend.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{friend.name}</h3>
                    {getStatusBadge(friend.status)}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>{friend.location} • {friend.distance}</span>
                  </div>
                </div>
                
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate('/app/messages')}>
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Chat
                </Button>
              </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quick Actions (navigation already fixed) */}
        {/* ... */}
      </div>
    </div>
  );
};

export default Dashboard;
