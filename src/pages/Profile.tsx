import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings, MapPin, Calendar, Grid, Ticket, 
  Edit3, LogOut, Sparkles, QrCode, Share2,
  Camera, ChevronRight, Crown, Shield
} from 'lucide-react';
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger 
} from "@/components/ui/sheet";
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

// --- TYPES ---
interface UserProfile {
  display_name: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
  is_premium?: boolean;
  events_count?: number;
  friends_count?: number;
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tickets');

  // --- 1. DATA FETCHING ---
  const { data: profile } = useQuery({
    queryKey: ['profile-main', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user?.id).single();
      return data as UserProfile;
    }
  });

  const { data: myTickets = [] } = useQuery({
    queryKey: ['my-tickets', user?.id],
    queryFn: async () => {
      // Fetch events I'm confirmed for
      const { data } = await supabase
        .from('event_attendees')
        .select(`
          status,
          event:events (id, title, start_date, location, image_url)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'confirmed')
        .gte('event.start_date', new Date().toISOString());
      
      return data?.map((d: any) => d.event) || [];
    }
  });

  // --- 2. SETTINGS ACTIONS ---
  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const updatePreference = async (key: string, value: any) => {
    // In a real app, you'd update a 'preferences' JSON column
    toast.success("Preferences updated");
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      
      {/* 1. HEADER (Identity) */}
      <div className="relative">
        {/* Cover Image Placeholder */}
        <div className="h-32 bg-gradient-to-r from-primary/20 to-purple-500/20 w-full" />
        
        {/* Settings Trigger (Top Right) */}
        <div className="absolute top-4 right-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="rounded-full bg-background/50 backdrop-blur-md hover:bg-background/80">
                <Settings className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              
              <div className="space-y-6">
                {/* Account Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Account</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Crown className="w-5 h-5" /></div>
                      <div>
                        <p className="font-medium">Premium Plan</p>
                        <p className="text-xs text-muted-foreground">{profile.is_premium ? 'Active' : 'Free Tier'}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/app/premium')}>Manage</Button>
                  </div>
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg"><Edit3 className="w-5 h-5" /></div>
                      <p className="font-medium">Edit Profile</p>
                     </div>
                     <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Preferences Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Discovery</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <Label>Maximum Distance</Label>
                      <span className="text-muted-foreground">20km</span>
                    </div>
                    <Slider defaultValue={[20]} max={100} step={1} className="py-2" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Ghost Mode</Label>
                    <Switch onCheckedChange={(v) => updatePreference('ghost_mode', v)} />
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <Button variant="destructive" className="w-full" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Avatar & Info */}
        <div className="px-4 -mt-12 mb-6">
          <div className="relative inline-block">
            <Avatar className="w-24 h-24 border-4 border-background shadow-xl">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="text-2xl">{profile.display_name[0]}</AvatarFallback>
            </Avatar>
            {profile.is_premium && (
              <div className="absolute bottom-0 right-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white p-1.5 rounded-full border-4 border-background shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          
          <div className="mt-3 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {profile.display_name}
                {profile.is_premium && <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] px-1.5 h-5">PRO</Badge>}
              </h1>
              <p className="text-muted-foreground text-sm">@{profile.username || 'user'}</p>
              {profile.bio && <p className="text-sm mt-2 max-w-xs">{profile.bio}</p>}
            </div>
            
            <Button size="sm" variant="outline" className="rounded-full gap-2">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>

          {/* Social Stats */}
          <div className="flex gap-6 mt-6 pb-2 border-b border-dashed">
            <div className="text-center">
              <span className="block font-bold text-lg">{profile.friends_count || 0}</span>
              <span className="text-xs text-muted-foreground">Friends</span>
            </div>
            <div className="text-center">
              <span className="block font-bold text-lg">{myTickets.length}</span>
              <span className="text-xs text-muted-foreground">Events</span>
            </div>
            <div className="text-center">
              <span className="block font-bold text-lg">12</span>
              <span className="text-xs text-muted-foreground">Vibes</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTENT TABS (The "Do" Loop) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-transparent border-b rounded-none h-12 px-4 gap-6 justify-start">
          <TabsTrigger 
            value="tickets" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3 pt-2"
          >
            <Ticket className="w-4 h-4 mr-2" /> My Tickets
          </TabsTrigger>
          <TabsTrigger 
            value="moments" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3 pt-2"
          >
            <Grid className="w-4 h-4 mr-2" /> Moments
          </TabsTrigger>
        </TabsList>

        {/* A. MY TICKETS (Wallet View) */}
        <TabsContent value="tickets" className="p-4 space-y-4">
          {myTickets.length > 0 ? (
            myTickets.map((event: any) => (
              <Card key={event.id} className="overflow-hidden border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/app/feed?event=${event.id}`)}>
                <div className="flex">
                  <div className="flex-1 p-4">
                    <Badge variant="outline" className="mb-2 text-[10px] text-muted-foreground border-dashed">CONFIRMED</Badge>
                    <h3 className="font-bold truncate">{event.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {new Date(event.start_date).toLocaleDateString()}</span>
                      <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {event.location}</span>
                    </div>
                  </div>
                  <div className="w-16 bg-muted/30 flex flex-col items-center justify-center border-l border-dashed">
                    <QrCode className="w-6 h-6 text-foreground/50" />
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-10 bg-muted/20 rounded-xl border-dashed border-2">
              <Ticket className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No upcoming plans</p>
              <Button variant="link" onClick={() => navigate('/app/feed')}>Explore Events</Button>
            </div>
          )}
        </TabsContent>

        {/* B. MOMENTS (Grid View) */}
        <TabsContent value="moments" className="p-1">
          <div className="grid grid-cols-3 gap-1">
            {/* Placeholder for future photo feature */}
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="aspect-square bg-muted/30 relative group cursor-pointer hover:opacity-90">
                <img src={`https://picsum.photos/seed/${i}/300/300`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;
