import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  MapPin,
  Users,
  TrendingUp,
  Plus,
  Ticket,
  Loader2,
  Search,
  Clock,
  Share2,
  Wallet,
  ArrowUpRight,
  Info,
  Check,
  AlertCircle, 
  Building2,
  Zap,
  UserPlus
} from "lucide-react"; 
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label"; 
import { useNavigate } from "react-router-dom";
import { format, isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useGeolocation } from '@/contexts/LocationContext';
import { useLaunchZone } from '@/hooks/useLaunchZone'; 
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';

// --- TYPES ---
type EventWithStats = any & {
  attendee_count?: number;
  my_status?: 'confirmed' | 'pending'; 
  is_boosted?: boolean;
}; 

// --- COMPONENTS ---
const EventSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map(i => (
      <Card key={i} className="border-0 shadow-sm bg-card/50">
        <CardContent className="p-4 flex gap-4">
          <div className="w-14 h-16 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-3 w-1/2 bg-muted/50 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const EmptyState = ({ title, description, action, actionLabel }: any) => (
  <Card className="border-2 border-dashed border-muted bg-muted/5 shadow-none py-12">
    <CardContent className="flex flex-col items-center text-center space-y-3">
      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mb-2">
        <Calendar className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{description}</p>
      {action && actionLabel && (
        <Button onClick={action} className="mt-4 bg-primary text-white shadow-md">
          <Plus className="w-4 h-4 mr-2" /> {actionLabel}
        </Button>
      )}
    </CardContent>
  </Card>
);

export default function Events() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Location Logic Adapted from Feed.tsx
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading } = useLaunchZone(location?.latitude, location?.longitude);

  useEffect(() => {
    const fetchCityName = async () => {
      if (location?.latitude && location?.longitude) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`);
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.state || "Nearby";
          setLocationName(city);
        } catch (e) {
          setLocationName("Global Mode");
        }
      }
    };
    fetchCityName();
  }, [location?.latitude, location?.longitude]);

  // UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my");
  const [hostedFilter, setHostedFilter] = useState<'active' | 'past'>('active');
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', account_name: '' });

  // Determination logic for waiting room
  const cityNotDetected = !locationLoading && !launchZoneLoading && !location; 
  const showCityUnavailable = !locationLoading && !launchZoneLoading && isInLaunchZone === false;
  const isLocked = cityNotDetected || showCityUnavailable; 
  const launchData = useLaunchZone(location?.latitude, location?.longitude);

  // --- DATA FETCHING ---
  const { data: myEvents = [], isLoading: loadingMy } = useQuery({
    queryKey: ["events", "my", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("creator_id", user?.id).order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: attendingEvents = [], isLoading: loadingAttending } = useQuery({
    queryKey: ["events", "attending", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("event_attendees").select(`status, event:events (*)`).eq("user_id", user?.id);
      return data?.map((item: any) => ({ ...item.event, my_status: item.status })) || [];
    },
    enabled: !!user?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ["events", "stats", user?.id],
    queryFn: async () => {
      const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user?.id).maybeSingle();
      return { walletBalance: wallet?.balance || 0 };
    },
    enabled: !!user?.id,
  });

  // --- RENDER HELPERS ---
  const isEventActive = (dateString: string) => {
    return !isPast(addHours(new Date(dateString), 3));
  };

  const renderEventCard = (event: any, type: 'mine' | 'attending') => {
    const status = isEventActive(event.start_date) ? { label: 'Active', color: 'bg-green-600' } : { label: 'Past', color: 'bg-gray-500' };
    return (
      <Card key={event.id} className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/app/events/${event.id}`)}>
        <div className="w-14 h-16 rounded-xl bg-primary/10 flex flex-col items-center justify-center relative overflow-hidden">
          {event.image_url && <img src={event.image_url} className="absolute inset-0 w-full h-full object-cover" />}
          <span className="text-[10px] font-bold uppercase">{format(new Date(event.start_date), 'MMM')}</span>
          <span className="text-xl font-bold">{format(new Date(event.start_date), 'd')}</span>
        </div>
        <div className="flex-1">
          <h3 className="font-bold truncate">{event.title}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</p>
        </div>
        <Badge className={status.color}>{status.label}</Badge>
      </Card>
    );
  };

  return (
    <LaunchZoneGuard {...launchData} locationDetected={!!location}>
    <div className="relative min-h-screen bg-background">
      {/* LAYER 1: CONTENT (Blurred if Locked) */}
      <div className={`container-mobile py-4 space-y-6 pb-24 transition-all duration-700 ${isLocked ? 'blur-md grayscale-[0.3] pointer-events-none opacity-60 select-none' : ''}`}>
        <div className="flex items-center justify-between px-1">
          <h1 className="text-2xl font-bold tracking-tight">Events in {locationName}</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search your vibe..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-muted/50 border-0 rounded-xl" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="my">Hosted</TabsTrigger>
            <TabsTrigger value="attending">Attending</TabsTrigger>
            <TabsTrigger value="analytics">Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="my" className="space-y-3 mt-6">
            {loadingMy ? <EventSkeleton /> : myEvents.map((e: any) => renderEventCard(e, 'mine'))}
          </TabsContent>
          
          <TabsContent value="attending" className="space-y-3 mt-6">
            {loadingAttending ? <EventSkeleton /> : attendingEvents.map((e: any) => renderEventCard(e, 'attending'))}
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Wallet Balance</p>
                <h2 className="text-4xl font-black mt-2">₦{(stats?.walletBalance || 0).toLocaleString()}</h2>
                <Button className="w-full mt-6 rounded-2xl h-12 font-bold" onClick={() => setIsPayoutModalOpen(true)}>Request Payout</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Payout Dialog */}
      <Dialog open={isPayoutModalOpen} onOpenChange={setIsPayoutModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payout Request</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input value={bankForm.bank_name} onChange={e => setBankForm({...bankForm, bank_name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input maxLength={10} value={bankForm.account_number} onChange={e => setBankForm({...bankForm, account_number: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayoutModalOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-white">Confirm Payout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </LaunchZoneGuard>
  );
}
