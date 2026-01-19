import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings, MapPin, Calendar, Grid, Ticket, 
  LogOut, Sparkles, QrCode, Share2,
  ChevronRight, Crown, Loader2, Edit2, AlertCircle
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// --- TYPES ---
interface UserProfile {
  display_name: string | null;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  is_premium?: boolean;
  friends_count?: number;
  preferences?: {
    discovery_radius?: number; 
    ghost_mode?: boolean;
  };
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('tickets');

  // --- 1. DATA FETCHING (FIXED) ---
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile-main', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('No user');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error('Profile not found');
      
      return data as UserProfile;
    },
    enabled: !!user?.id, // ✅ Only run when user exists
    retry: 1,
  });

  const { data: myTickets = [] } = useQuery({
    queryKey: ['my-tickets', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Step 1: Get confirmed attendances
      const { data: attendances, error: attError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');
      
      if (attError || !attendances?.length) return [];
      
      // Step 2: Fetch future events
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_date, location, image_url')
        .in('id', attendances.map(a => a.event_id))
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true });
      
      if (eventsError) return [];
      return events || [];
    },
    enabled: !!user?.id,
  });

  // --- 2. ACTIONS (FIXED) ---
  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const updatePreference = async (key: string, value: any) => {
    if (!user?.id || !profile) return;
    
    // Create new preferences object merging existing ones
    const newPreferences = {
      ...(profile.preferences || {}),
      [key]: value
    };

    // Optimistically update cache
    queryClient.setQueryData(['profile-main', user.id], (old: UserProfile | undefined) => ({
      ...old!,
      preferences: newPreferences
    }));
    
    const { error } = await supabase
      .from('profiles')
      .update({ preferences: newPreferences })
      .eq('user_id', user.id);
    
    if (error) {
      toast.error('Failed to save preference');
      // Revert on error would go here
      return;
    }
    
    // Invalidate profile query to ensure sync
    queryClient.invalidateQueries({ queryKey: ['profile-main'] });
    
    if (key === 'discovery_radius') {
        // Debounce toast could be better, but this confirms save
        // toast.success(`Radius updated to ${value / 1000}km`);
    } else {
        toast.success("Preference saved");
    }
  };

  // --- 3. LOADING & ERROR STATES (FIXED) ---
  
  // Redirect if no user
  if (!user) {
    navigate('/auth');
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Failed to load profile</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {error?.message || 'Profile not found'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button onClick={() => navigate('/app/feed')}>
              Go to Feed
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || 'User';
  const username = profile.username || 'user';
  const initial = displayName[0]?.toUpperCase() || 'U';
  
  const currentRadiusKm = (profile.preferences?.discovery_radius || 20000) / 1000;
  const isGhostMode = profile.preferences?.ghost_mode || false;

  return (
    <div className="min-h-screen bg-background pb-24">
      
      {/* 1. HEADER (Identity) */}
      <div className="relative">
        {/* Cover Image Placeholder */}
        <div className="h-36 bg-gradient-to-r from-primary/10 via-purple-500/10 to-orange-500/10 w-full" />
        
        {/* Settings Dialog */}
        <div className="absolute top-4 right-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="rounded-full bg-background/50 backdrop-blur-md hover:bg-background/80 shadow-sm border border-white/20">
                <Settings className="w-5 h-5 text-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Account Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Account</h3>
                  
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Crown className="w-5 h-5" /></div>
                      <div>
                        <p className="font-semibold text-sm">Premium Plan</p>
                        <p className="text-xs text-muted-foreground">{profile.is_premium ? 'Active' : 'Free Tier'}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/app/premium')}>Manage</Button>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors">
                     <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg"><Edit2 className="w-4 h-4" /></div>
                      <p className="font-medium text-sm">Edit Profile</p>
                     </div>
                     <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Preferences Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discovery</h3><div className="space-y-4 px-1">
                    <div className="flex justify-between text-sm">
                      <Label>Max Distance</Label>
                      <span className="text-muted-foreground font-mono">{currentRadiusKm}km</span>
                    </div>
                    <Slider 
                      defaultValue={[currentRadiusKm]} 
                      max={100} // 100km max
                      step={1}
                      // Convert KM back to Meters for DB
                      onValueChange={(val) => updatePreference('discovery_radius', val[0] * 1000)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>Ghost Mode</span>
                      <span className="font-normal text-xs text-muted-foreground">Hide location on map</span>
                    </Label>
                    <Switch onCheckedChange={(v) => updatePreference('ghost_mode', v)} />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button variant="destructive" className="w-full" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Avatar & Info */}
        <div className="px-6 -mt-12 mb-6">
          <div className="relative inline-block">
            <Avatar className="w-24 h-24 border-[4px] border-background shadow-xl">
              <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="text-2xl bg-muted text-muted-foreground">{initial}</AvatarFallback>
            </Avatar>
            {profile.is_premium && (
              <div className="absolute bottom-0 right-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white p-1.5 rounded-full border-[3px] border-background shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          
          <div className="mt-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {displayName}
                {profile.is_premium && <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] px-1.5 h-5 hover:bg-amber-200">PRO</Badge>}
              </h1>
              <p className="text-muted-foreground text-sm font-medium">@{username}</p>
              {profile.bio && <p className="text-sm mt-3 text-foreground/80 leading-relaxed max-w-xs">{profile.bio}</p>}
            </div>
            
            <Button size="sm" variant="outline" className="rounded-full gap-2 h-9 px-4 shadow-sm bg-background">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>

          {/* Social Stats */}
          <div className="flex gap-8 mt-6 pb-4 border-b border-dashed border-border/60">
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => navigate('/app/friends')}>
              <span className="block font-bold text-lg">{profile.friends_count || 0}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Friends</span>
            </div>
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
              <span className="block font-bold text-lg">{myTickets.length}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Events</span>
            </div>
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
              <span className="block font-bold text-lg">84</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Score</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTENT TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-transparent border-b rounded-none h-12 px-6 gap-8 justify-start">
          <TabsTrigger 
            value="tickets" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all"
          >
            <Ticket className="w-4 h-4 mr-2" /> My Tickets
          </TabsTrigger>
          <TabsTrigger 
            value="moments" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all"
          >
            <Grid className="w-4 h-4 mr-2" /> Moments
          </TabsTrigger>
        </TabsList>

        {/* A. MY TICKETS (Wallet View) */}
        <TabsContent value="tickets" className="p-4 space-y-4 min-h-[300px]">
          {myTickets.length > 0 ? (
            myTickets.map((event: any) => (
              <Card key={event.id} className="overflow-hidden border-l-[6px] border-l-primary shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-card/50" onClick={() => navigate(`/app/feed?event=${event.id}`)}>
                <div className="flex">
                  <div className="flex-1 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200">CONFIRMED</Badge>
                    </div>
                    <h3 className="font-bold truncate text-base">{event.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" /> {new Date(event.start_date).toLocaleDateString()}</span>
                      <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1.5 text-primary" /> {event.location || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="w-20 bg-muted/40 flex flex-col items-center justify-center border-l border-dashed border-border/60">
                    <QrCode className="w-8 h-8 text-foreground/20" />
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Ticket className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold text-lg">No tickets yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">You haven't RSVP'd to any events.</p>
              <Button onClick={() => navigate('/app/feed')}>Find Events</Button>
            </div>
          )}
        </TabsContent>

        {/* B. MOMENTS (Grid View) */}
        <TabsContent value="moments" className="p-1 min-h-[300px]">
          <div className="grid grid-cols-3 gap-1">
            {/* Placeholder for future photo feature */}
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="aspect-square bg-muted/30 relative group cursor-pointer overflow-hidden">
                <img src={`https://picsum.photos/seed/${i + user.id}/400/400`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="moment" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;