import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, MapPin, Bell, Lock, UserPlus, Globe
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useLaunchZone } from '@/hooks/useLaunchZone';

export default function Feed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useRealtimeNotifications(user?.id);
  
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const { isInLaunchZone, currentCount, targetCount, cityName: launchCityName, isLoading: launchZoneLoading } = useLaunchZone(location?.latitude, location?.longitude);
  
  const [activeTab, setActiveTab] = useState("for_you");
  const [searchQuery, setSearchQuery] = useState("");

  const isLocked = !locationLoading && !launchZoneLoading && isInLaunchZone === false;
  const cityNotDetected = !locationLoading && !launchZoneLoading && !location;

  useEffect(() => {
    if (location?.latitude && location?.longitude) {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`)
        .then(res => res.json())
        .then(data => setLocationName(data.address.city || data.address.town || "Nearby"));
    }
  }, [location]);

  return (
    <div className="relative min-h-screen bg-background pb-24">
      
      {/* HEADER - Always Interactive */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">Discover <span className="text-primary">{launchCityName || locationName}</span></h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {locationName}</p>
            </div>
            <Button size="icon" variant="ghost" className="rounded-full relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unreadCount}</span>}
            </Button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search vibes..." className="pl-9 bg-muted/50 border-0 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {/* TAB LIST - Moved outside of the blur layer to be switchable */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="w-full overflow-x-auto scrollbar-hide px-4 pb-3">
            <TabsList className="bg-transparent p-0 gap-2 flex justify-start">
              {['for_you', 'trending', 'communities', 'music', 'nightlife', 'tech'].map(tab => (
                <TabsTrigger 
                  key={tab} 
                  value={tab} 
                  className="rounded-full border px-4 py-2 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
                >
                  {tab.replace('_', ' ')}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>

      {/* CONTENT AREA - Blurred ONLY if locked */}
      <div className={`transition-all duration-700 ${isLocked ? 'blur-xl grayscale pointer-events-none opacity-40 select-none' : ''}`}>
        <div className="px-4 py-6 space-y-6">
          {activeTab === 'communities' ? (
             <div className="space-y-4">
                {/* Real community data would be mapped here */}
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-card rounded-2xl border shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                    <div className="h-4 w-1/2 bg-muted rounded" />
                  </div>
                ))}
             </div>
          ) : (
            <div className="space-y-6">
              {/* Real event data would be mapped here */}
              {[1, 2].map(i => (
                <Card key={i} className="overflow-hidden border-0 shadow-lg rounded-[2rem]">
                  <div className="h-48 bg-muted animate-pulse" />
                  <CardContent className="p-5">
                    <div className="h-6 w-3/4 bg-muted rounded mb-2" />
                    <div className="h-4 w-1/2 bg-muted/50 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* LAYER 2: CENTERED WAITING UI CARD */}
      {isLocked && (
        <div className="fixed inset-x-0 top-[40%] z-50 flex items-center justify-center p-6 pointer-events-none">
          <div className="w-full max-w-md p-8 bg-card/90 backdrop-blur-xl rounded-[2.5rem] border border-dashed border-primary/30 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 pointer-events-auto">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto"><Lock className="w-8 h-8 text-primary/60" /></div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{launchCityName || locationName} IS LOADING...</h2>
                <p className="text-xs text-muted-foreground font-medium">Unlocked at <span className="text-foreground font-bold">{targetCount} Pioneers</span>.</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Progress</span>
                  <span>{currentCount} / {targetCount}</span>
                </div>
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden border p-[3px]">
                  <div 
                    className="h-full bg-gradient-to-r from-[#6366f1] to-[#a855f7] rounded-full transition-all duration-1000" 
                    style={{ width: `${(currentCount / targetCount) * 100}%` }} 
                  />
                </div>
              </div>

              <Button className="w-full h-14 rounded-2xl font-bold uppercase gap-2 bg-gradient-to-r from-[#6366f1] to-[#a855f7] text-white border-0 shadow-xl" onClick={() => navigate('/app/friends')}>
                <UserPlus className="w-5 h-5" /> Invite Friends
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
