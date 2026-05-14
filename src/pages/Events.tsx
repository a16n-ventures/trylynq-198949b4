import { useState, useEffect, useCallback } from "react";
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
  Video,
  MapPinned,
  Clock,
  Edit,
  Share2,
  Wallet,
  ArrowUpRight,
  Info,
  Check,
  AlertCircle, 
  Building2,
  CreditCard,
  Zap,
  Hourglass
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; 
import { z } from 'zod';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';
import { EventFilterBar, applyEventFilters } from '@/components/events/EventFilterBar';
import { useEventFilters } from '@/hooks/useEventFilters';
import { distanceKm as calcDistanceKm } from '@/hooks/useNearbyEvents';
import { formatTicketPrice } from '@/lib/eventFormat';

// --- TYPES ---
type PremiumFeature = {
  user_id: string;
  feature_type: string;
  is_active: boolean;
  expires_at: string;
};

type Subscription = {
  user_id: string;
  plan_type?: string;
  plan_interval?: string;
  status: string;
};

type Event = {
  id: string;
  title: string;
  description?: string;
  category: string;
  start_date: string;
  location: string;
  ticket_price: number;
  image_url?: string;
  creator_id: string;
  is_public: boolean;
  is_boosted?: boolean; // Calculated field
  max_attendees?: number | null;
  event_type: 'physical' | 'virtual';
  meeting_link?: string | null;
  creator?: {
    user_id: string;
    display_name: string;
    avatar_url?: string;
  };
};

type EventWithStats = Event & {
  attendee_count?: number;
  my_status?: 'confirmed' | 'pending'; 
}; 

type BankDetails = {
  bank_name: string;
  account_number: string;
  account_name: string;
}; 

const bankDetailsSchema = z.object({
  bank_name: z.string()
    .trim()
    .min(3, 'Bank name too short')
    .max(50, 'Bank name too long')
    .regex(/^[a-zA-Z\s]+$/, 'Bank name can only contain letters and spaces'),
  account_number: z.string()
    .trim()
    .length(10, 'Nigerian account numbers must be exactly 10 digits')
    .regex(/^\d{10}$/, 'Account number must contain only digits'),
  account_name: z.string()
    .trim()
    .min(3, 'Account name too short')
    .max(100, 'Account name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Account name contains invalid characters')
});

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

const EmptyState = ({ 
  title, 
  description, 
  action, 
  actionLabel 
}: { 
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}) => (
  <Card className="border-2 border-dashed border-muted bg-muted/5 shadow-none py-12">
    <CardContent className="flex flex-col items-center text-center space-y-3">
      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mb-2">
        <Calendar className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <h3 className="font-semibold text-lg text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        {description}
      </p>
      {action && actionLabel && (
        <Button onClick={action} className="mt-4 gradient-primary text-white shadow-md">
          <Plus className="w-4 h-4 mr-2" /> {actionLabel}
        </Button>
      )}
    </CardContent>
  </Card>
);

export default function Events() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { location, isLoading: locationLoading } = useGeolocation();
  const [geocodedCity, setGeocodedCity] = useState<string | null>(null); 
  const { isInLaunchZone, isWithinCity, isLoading: launchZoneLoading, currentCount, targetCount, cityName: launchCityName }
  = useLaunchZone(location?.latitude, location?.longitude, geocodedCity); 
  
  const [milestone, setMilestone] = useState<{ current: number; target: number; is_unlocked: boolean; zone_name?: string } | null>(null);
  const [locationName, setLocationName] = useState("Detecting..."); 

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my");
  const [hostedFilter, setHostedFilter] = useState<'active' | 'past'>('active');
  const [filters, setFilters] = useEventFilters();
  
  // Payout & Modal States
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [bankForm, setBankForm] = useState<BankDetails>({ bank_name: '', account_number: '', account_name: '' }); 
  
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-type', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase.from('profiles').select('user_type, verification_status').eq('user_id', userId).single();
      return data;
    },
    enabled: !!userId,
  });
  
  useEffect(() => {
    if (!user || !location) return;

    const getMilestoneData = async () => {
      try {
        const { data, error } = await supabase.rpc('generate_smart_feed', {
          p_user_id: user.id,
          p_user_lat: location.latitude,
          p_user_long: location.longitude,
        });
        if (error) {
          console.error("RPC Error:", error);
          return;
        }
        const payload = data as { milestone?: { zone_name?: string; current?: number; target?: number; is_unlocked?: boolean } } | null;
        if (payload?.milestone) {
          setMilestone(payload.milestone as any);
          setLocationName(payload.milestone.zone_name || "Nearby");
        }
      } catch (e) {
        console.error("Failed to fetch zone milestone", e);
      }
    };

    getMilestoneData();
  }, [user, location]);

  // Realtime: refresh on RSVP changes
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel('events-page-attendees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['events'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, queryClient]);

  // --- HELPER: Logic to check if an event is still "Active" ---
  const isEventActive = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();
    // Event is active until 3 hours after start time
    const expirationTime = addHours(eventDate, 3);
    return now < expirationTime;
  };

  // --- HELPER: Check premium boost ---
  const checkBoostPermission = (creatorId: string, premiums: PremiumFeature[], subs: Subscription[]) => {
    // Check Premium Features
    const hasActiveFeature = premiums.some(f => 
      f.user_id === creatorId &&
      f.is_active && 
      new Date(f.expires_at) > new Date() && 
      (f.feature_type === 'event_boost' || f.feature_type === 'full_package')
    );

    // Check Subscriptions
    const hasActiveSub = subs.some(s => 
      s.user_id === creatorId &&
      s.status === 'active' && 
      (s.plan_type === 'event_boost' || s.plan_type === 'full_package')
    );

    return hasActiveFeature || hasActiveSub;
  };

  const applyEventLocations = async <T extends { id: string }>(eventList: T[]): Promise<Array<T & { location: string; distanceKm: number | null }>> => {
    if (eventList.length === 0) return [];
    const { data: locations } = await supabase
      .from('event_locations')
      .select('event_id, location_name, latitude, longitude')
      .in('event_id', eventList.map((event) => event.id));
    const locationMap = new Map((locations || []).map((loc) => [loc.event_id, loc]));
    return eventList.map((event) => {
      const loc = locationMap.get(event.id);
      let distanceKm: number | null = null;
      if (loc?.latitude != null && loc?.longitude != null && location?.latitude && location?.longitude) {
        distanceKm = Number(calcDistanceKm(location.latitude, location.longitude, Number(loc.latitude), Number(loc.longitude)).toFixed(1));
      }
      return {
        ...event,
        location: loc?.location_name || 'Location TBA',
        distanceKm,
      };
    });
  };

  // 1. Fetch My Events
  const { data: myEvents = [], isLoading: loadingMy } = useQuery({
    queryKey: ["events", "my", userId],
    queryFn: async (): Promise<EventWithStats[]> => {
      if (!userId) return [];
      
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .eq("creator_id", userId)
        .order("start_date", { ascending: false }); 
      
      if (error) throw error;
      if (!events || events.length === 0) return [];

      const creatorIds = [...new Set(events.map(e => e.creator_id))];
      const eventIds = events.map(e => e.id);

      const [premiumRes, subRes, attendeesRes] = await Promise.all([
        supabase.from("premium_features").select("*").in("user_id", creatorIds),
        supabase.from("subscriptions").select("*").in("user_id", creatorIds),
        supabase.from("event_attendees").select("event_id").in("event_id", eventIds).eq("status", "confirmed")
      ]);

      const premiums = premiumRes.data || [];
      const subs = subRes.data || [];
      const attendees = attendeesRes.data || [];

      const countMap: Record<string, number> = {};
      attendees.forEach(a => countMap[a.event_id] = (countMap[a.event_id] || 0) + 1);

      const processedEvents = events.map((event: any) => ({
        ...event,
        event_type: (event.event_type as 'physical' | 'virtual') || 'physical',
        attendee_count: countMap[event.id] || 0,
        is_boosted: checkBoostPermission(event.creator_id, premiums, subs)
      }));
      return applyEventLocations(processedEvents) as Promise<EventWithStats[]>;
    },
    enabled: !!userId,
    staleTime: 30000,
  });

// 2. Fetch Attending Events
  const { data: attendingEvents = [], isLoading: loadingAttending } = useQuery({
    queryKey: ["events", "attending", userId],
    queryFn: async (): Promise<EventWithStats[]> => {
      if (!userId) return [];
      
      const { data: rawData, error } = await supabase
        .from("event_attendees")
        .select(`
          status,
          event:events (*)
        `)
        .eq("user_id", userId)
        .in("status", ["confirmed", "pending"])
        .not("event", "is", null);
      
      if (error) throw error;
      if (!rawData || rawData.length === 0) return [];

      const events = rawData.map((item: any) => ({
        ...item.event,
        event_type: (item.event?.event_type as 'physical' | 'virtual') || 'physical',
        my_status: item.status
      }));

      const creatorIds = [...new Set(events.map((e: any) => e.creator_id))];
      const eventIds = events.map((e: any) => e.id);

      const [premiumRes, subRes, attendeesRes] = await Promise.all([
        supabase.from("premium_features").select("*").in("user_id", creatorIds),
        supabase.from("subscriptions").select("*").in("user_id", creatorIds),
        supabase.from("event_attendees").select("event_id").in("event_id", eventIds).eq("status", "confirmed")
      ]);

      const premiums = premiumRes.data || [];
      const subs = subRes.data || [];
      const attendees = attendeesRes.data || [];

      const countMap: Record<string, number> = {};
      attendees.forEach(a => countMap[a.event_id] = (countMap[a.event_id] || 0) + 1);

      const eventsWithLocations = await applyEventLocations(events);

      const processedEvents = eventsWithLocations.map((event: any) => ({
        ...event,
        attendee_count: countMap[event.id] || 0,
        is_boosted: checkBoostPermission(event.creator_id, premiums, subs)
      }));

      // ✅ SORTING LOGIC: Active First (Ascending), then Past (Descending)
      const now = new Date();
      
      const active = processedEvents
        .filter((e: any) => isEventActive(e.start_date))
        .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()); // Closest upcoming first
        
      const past = processedEvents
        .filter((e: any) => !isEventActive(e.start_date))
        .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()); // Most recent past first

      return [...active, ...past];
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // 3. Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ["events", "stats", userId],
    queryFn: async () => {
      if (!userId) return { 
        totalHosted: 0, totalAttendees: 0, upcomingEvents: 0, pastEvents: 0,
        netRevenue: 0, walletBalance: 0,
        jobsCompleted: 0, serviceRevenue: 0, repeatClients: 0, avgRating: null as number | null
      };
      
      const { data: myEventsList } = await supabase
        .from('events').select('id, start_date, ticket_price').eq('creator_id', userId);

      let walletBalance = 0;
      const { data: wallet } = await supabase
        .from('wallets').select('balance').eq('user_id', userId).maybeSingle();
      if (wallet) walletBalance = wallet.balance;

      // ── Ticket revenue ─────────────────────────────────────────────────────
      let grossRevenue = 0;
      let totalAttendees = 0;
      let upcomingEvents = 0;
      let pastEvents = 0;

      if (myEventsList?.length) {
        const ids = myEventsList.map(e => e.id);
        const { data: allAttendees } = await supabase
          .from('event_attendees').select('event_id').in('event_id', ids).eq('status', 'confirmed');

        totalAttendees = allAttendees?.length || 0;
        const countMap: Record<string, number> = {};
        allAttendees?.forEach(a => countMap[a.event_id] = (countMap[a.event_id] || 0) + 1);

        for (const event of myEventsList) {
          if (event.ticket_price > 0) grossRevenue += (countMap[event.id] || 0) * event.ticket_price;
        }
        upcomingEvents = myEventsList.filter(e => isFuture(new Date(e.start_date))).length;
        pastEvents = myEventsList.filter(e => isPast(new Date(e.start_date))).length;
      }

      // ── Service request stats (business users) ────────────────────────────
      // These mirror the wallet credit trigger: status = 'completed' fires a
      // credit to the seller's wallet via the release-escrow edge function.
      let jobsCompleted = 0;
      let serviceRevenue = 0;
      let repeatClients = 0;
      let avgRating: number | null = null;

      const { data: serviceReqs } = await (supabase.from('service_requests') as any)
        .select('id, status, amount, buyer_id, escrow_status')
        .eq('seller_id', userId)
        .eq('status', 'completed');

      if (serviceReqs?.length) {
        jobsCompleted = serviceReqs.length;
        serviceRevenue = serviceReqs.reduce((sum: number, r: any) => sum + (r.amount || 0), 0) * 0.98; // 2% platform fee

        // Repeat clients = buyer_ids that appear more than once
        const buyerCounts: Record<string, number> = {};
        serviceReqs.forEach((r: any) => {
          buyerCounts[r.buyer_id] = (buyerCounts[r.buyer_id] || 0) + 1;
        });
        repeatClients = Object.values(buyerCounts).filter(c => c > 1).length;
      }

      // Avg rating — reads from service_ratings if it exists, gracefully skips if not
      const { data: ratings } = await (supabase.from('service_ratings') as any)
        .select('rating').eq('seller_id', userId);
      if (ratings?.length) {
        avgRating = parseFloat(
          (ratings.reduce((s: number, r: any) => s + r.rating, 0) / ratings.length).toFixed(1)
        );
      }

      return {
        totalHosted: myEventsList?.length || 0,
        totalAttendees,
        upcomingEvents,
        pastEvents,
        netRevenue: grossRevenue * 0.98,
        walletBalance,
        // service-specific
        jobsCompleted,
        serviceRevenue,
        repeatClients,
        avgRating,
      };
    },
    enabled: !!userId && activeTab === "analytics",
    staleTime: 60000,
  });

    // 4. Fetch Saved Bank Details
  const { data: savedBankDetails, refetch: refetchBank } = useQuery({
    queryKey: ["bank-details", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_bank_details').select('*').eq('user_id', userId).maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!userId && isPayoutModalOpen
  });

  // Handle Save Bank
  const saveBankDetails = async () => {
    if (!bankForm.account_number || !bankForm.bank_name || !bankForm.account_name) {
      toast.error("Please fill in all bank details");
      return;
    }
    try {
      const { error } = await supabase.from('user_bank_details').upsert({ user_id: userId, ...bankForm, updated_at: new Date().toISOString() });
      if (error) throw error;
      await refetchBank();
      toast.success("Bank details saved!");
    } catch (e: any) {
      toast.error('Failed to save bank details');
    }
  };

  // Process Payout Request
  const processPayout = async () => {
    if (!stats?.walletBalance || stats?.walletBalance < 1000) {
      toast.error("Minimum withdrawal amount is ₦1,000");
      return;
    }
    setIsPayoutLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-payout', { body: { amount: stats.walletBalance } });
      if (error) throw error;
      toast.success("Payout request submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["events", "stats", userId] });
    } catch (error: any) {
      toast.error(error.message || "Failed to request payout");
    } finally {
      setIsPayoutLoading(false);
    }
  };

  // ✅ CHANGED: Logic to determine display status
  const getEventStatus = (startDate: string) => {
    const date = new Date(startDate);
    const now = new Date();
    const expirationTime = addHours(date, 1); // 1-hour duration assumption

    // If start date is past but still within active window
    if (isPast(date) && now < expirationTime) {
      // Check if nearing expiration (e.g., last 30 mins)
      if (differenceInMinutes(expirationTime, now) < 30) {
        return { label: 'Expiring Soon', color: 'bg-orange-500 animate-pulse' };
      }
      return { label: 'Happening Now', color: 'bg-green-600 animate-pulse' };
    }

    if (isToday(date)) return { label: 'Today', color: 'bg-blue-500' };
    if (isFuture(date)) return { label: 'Upcoming', color: 'bg-primary' };
    
    return { label: 'Past', color: 'bg-gray-500' };
  };

  const shareEvent = async (event: Event) => {
    const shareData = {
      title: event.title,
      text: `Check out this event: ${event.title}`,
      url: `${window.location.origin}/app/events/${event.id}`
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Event link copied!');
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };
  
const renderEventCard = (event: EventWithStats, type: 'mine' | 'attending') => {
    const status = getEventStatus(event.start_date);
    const eventDate = new Date(event.start_date);
    
    const isStillActive = isEventActive(event.start_date);
    const isEventPast = !isStillActive;
    const isPending = event.my_status === 'pending';

    return (
      <Card 
        key={event.id} 
        className={`hover:shadow-md transition-all border-border/50 cursor-pointer group ${isPending ? 'border-yellow-200 bg-yellow-50/10' : ''}`}
        onClick={() => navigate(`/app/events/${event.id}`)}
      >
        <CardContent className="p-4 flex items-center gap-4">
          {/* Left: Image or Date Box */}
          <div className="w-14 h-16 rounded-xl bg-primary/5 border border-primary/10 flex flex-col items-center justify-center text-primary flex-shrink-0 relative overflow-hidden">
             {event.image_url ? (
                <img 
                  src={event.image_url} 
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${isPending || isEventPast ? 'grayscale-[50%]' : 'group-hover:scale-110'}`}
                  alt={event.title}
                />
             ) : (
               <>
                <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                  {format(eventDate, 'MMM')}
                </span>
                <span className="text-xl font-bold leading-none">
                  {format(eventDate, 'd')}
                </span>
               </>
             )}
             
            {/* Status indicator dot */}
            {isStillActive && !isPending && (
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${status.color} z-10 border border-white`} />
            )}
            
             {/* Pending Overlay */}
             {isPending && (
               <div className="absolute inset-0 bg-yellow-500/30 flex items-center justify-center z-20">
                 <Clock className="w-4 h-4 text-white drop-shadow-md" />
               </div>
             )}
          </div>

                    {/* Center: Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-1.5">
              <h3 className="font-bold text-base truncate">{event.title}</h3>
              {/* Status badge */}
              {!isPending && (
                <Badge className={`text-[10px] px-1.5 py-0 border-0 text-white ${status.color} ${status.label === 'Happening Now' ? 'animate-pulse' : ''}`}>
                    {status.label}
                </Badge>
              )}
              {isPending && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-700 border-yellow-300 bg-yellow-50">
                    Pending
                </Badge>
              )}
               {event.is_boosted && !isEventPast && (
                  <Badge className="bg-yellow-400 text-white border-0 px-1 py-0"><Zap className="w-2.5 h-2.5" /></Badge>
               )}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" /> {event.location}</span>
              {(event as any).distanceKm != null && (
                <span className="text-[11px] font-bold text-primary shrink-0">{(event as any).distanceKm}km away</span>
              )}
            </div>
            
            {/* --- MODIFIED: Performance-First View for Builders --- */}
            {type === 'mine' && (userProfile?.user_type === 'business' || userProfile?.user_type === 'personal') ? (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" /> {event.attendee_count || 0} {isEventPast ? 'attended' : 'attending'}
                </div>
                {event.ticket_price > 0 && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                     <Ticket className="w-3 h-3" /> ₦{event.ticket_price.toLocaleString()}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Right: Actions */}
           <div className="flex flex-col gap-2">
            {type === 'mine' ? (
              <div className="flex gap-1">
                <Button 
                    size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full"
                    onClick={(e) => { e.stopPropagation(); shareEvent(event); }}
                >
                    <Share2 className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button 
                    size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs"
                    onClick={(e) => { e.stopPropagation(); navigate(`/app/events/${event.id}`); }}
                >
                    Manage
                </Button>
              </div>
            ) : (
                <Button 
                    size="sm" 
                    variant={isEventPast ? "outline" : "default"}
                    className={`h-8 rounded-full px-3 text-xs ${isPending ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : ''}`}
                    disabled={isEventPast}
                    onClick={(e) => { e.stopPropagation(); navigate(`/app/events/${event.id}`); }}
                >
                    {isEventPast ? 'Ended' : isPending ? 'Waiting' : 'View'}
                </Button>
            )}
           </div>

        </CardContent>
      </Card>
    );
  };

  const filterEvents = (events: EventWithStats[]) => {
    let list = events as any[];
    if (searchQuery) {
      list = list.filter((event) =>
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return applyEventFilters(list as any, filters) as EventWithStats[];
  };

  const filteredMyEvents = filterEvents(myEvents);
  
  // Active Filter with Grace Period (Strictly filter out events older than 3 hours)
  const myActiveEvents = filteredMyEvents.filter(e => isEventActive(e.start_date));
  const myPastEvents = filteredMyEvents.filter(e => !isEventActive(e.start_date));
  
  const filteredAttendingEvents = filterEvents(attendingEvents); 
  
  const handleCityResolved = useCallback((city: string) => {
    setGeocodedCity(prev => prev === city ? prev : city);
  }, []);

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={!!launchCityName}
      isInLaunchZone={isInLaunchZone}
      cityName={launchCityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0}
      onCityResolved={handleCityResolved}
    >
      <div className="container-mobile py-4 space-y-6 pb-24">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-2xl font-bold tracking-tight">Events in <span className="text-primary">{launchCityName}</span></h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search events, locations, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/50 backdrop-blur-sm"
          />
        </div>
        <EventFilterBar value={filters} onChange={setFilters} className="-mt-2" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl">
            {/* --- MODIFIED: Dynamic Dashboard Tab --- */}
            <TabsTrigger value="my" className="rounded-lg text-xs">
              {userProfile?.user_type === 'business' || userProfile?.user_type === 'personal' ? 'Dashboard' : 'Hosted'}
            </TabsTrigger>
            <TabsTrigger value="attending" className="rounded-lg text-xs">Attending</TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-lg text-xs">Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="my" className="space-y-3 mt-6 animate-in fade-in-50">
            
             {/* Center Toggle */}
            <div className="flex items-center gap-2 mb-4 bg-muted/30 p-1 rounded-lg w-fit mx-auto">
              <button
                onClick={() => setHostedFilter('active')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${hostedFilter === 'active' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
              >
                Active ({myActiveEvents.length})
              </button>
              <button
                 onClick={() => setHostedFilter('past')}
                 className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${hostedFilter === 'past' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
              >
                Past ({myPastEvents.length})
              </button>
            </div>

            {loadingMy ? (
              <EventSkeleton />
            ) : hostedFilter === 'active' ? (
               // Active Events List
              myActiveEvents.length === 0 ? (
                  <EmptyState
                  title="No Active Events"
                  description={searchQuery 
                      ? "No active events match your search." 
                      : "You don't have any upcoming events. Create one now!"
                  }
                  action={() => navigate('/create-event')}
                  actionLabel="Create Event"
                  />
              ) : (
                  <div className="space-y-3">
                  {myActiveEvents.map(e => renderEventCard(e, 'mine'))}
                  </div>
              )
            ) : (
               // Past Events List
               myPastEvents.length === 0 ? (
                  <EmptyState
                  title="No Past Events"
                  description="You haven't hosted any events that have ended yet."
                  />
              ) : (
                  <div className="space-y-3">
                  {myPastEvents.map(e => renderEventCard(e, 'mine'))}
                  </div>
              )
            )}
          </TabsContent>

          <TabsContent value="attending" className="space-y-3 mt-6 animate-in fade-in-50">
            {loadingAttending ? (
              <EventSkeleton />
            ) : filteredAttendingEvents.length === 0 ? (
              <EmptyState
                title="No Events Found"
                description={searchQuery
                  ? "No events match your search."
                  : "You haven't joined any events yet. Discover exciting events happening around you!"
                }
                action={() => setActiveTab('discover')}
                actionLabel="Discover Events"
              />
            ) : (
              <div className="space-y-3">
                {filteredAttendingEvents.map(e => renderEventCard(e, 'attending'))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-5 mt-6 animate-in fade-in-50">
            
            {/* Hero Stats Row — business sees service KPIs, personal sees event KPIs */}
            {userProfile?.user_type === 'business' ? (
              <div className="grid grid-cols-2 gap-3">
                {/* Jobs Completed */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-cyan-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-cyan-100 dark:bg-cyan-900/30 p-2.5 rounded-xl mb-2">
                      <Check className="w-5 h-5 text-cyan-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">{stats?.jobsCompleted || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Jobs Done</span>
                  </CardContent>
                </Card>

                {/* Service Revenue */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-green-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-green-100 dark:bg-green-900/30 p-2.5 rounded-xl mb-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">
                      ₦{((stats?.serviceRevenue || 0) / 1000 >= 1
                        ? ((stats?.serviceRevenue || 0) / 1000).toFixed(1) + 'k'
                        : (stats?.serviceRevenue || 0).toLocaleString())}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Service Rev.</span>
                  </CardContent>
                </Card>

                {/* Repeat Clients */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-primary/15 p-2.5 rounded-xl mb-2">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">{stats?.repeatClients || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Repeat Clients</span>
                  </CardContent>
                </Card>

                {/* Avg Rating */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-xl mb-2">
                      <Zap className="w-5 h-5 text-amber-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">
                      {stats?.avgRating != null ? stats.avgRating : '—'}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Avg Rating</span>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-0 shadow-md bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-primary/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-primary/15 p-2.5 rounded-xl mb-2">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">{stats?.totalHosted || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Events Hosted</span>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-xl mb-2">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">{stats?.totalAttendees || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Total Attendees</span>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-green-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-green-100 dark:bg-green-900/30 p-2.5 rounded-xl mb-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">{stats?.upcomingEvents || 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Upcoming</span>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent overflow-hidden relative">
                  <div className="absolute -right-6 -top-6 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl" />
                  <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 relative z-10">
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-xl mb-2">
                      <Ticket className="w-5 h-5 text-amber-600" />
                    </div>
                    <span className="text-3xl font-extrabold tracking-tight">
                      ₦{(stats?.netRevenue || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-1">Net Earnings</span>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* PAYOUT WALLET CARD — ticket sellers AND business service providers */}
            {(userProfile?.user_type === 'business' || userProfile?.user_type === 'personal') && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5 shadow-lg overflow-hidden relative mt-3">
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -left-10 -bottom-10 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
              
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/20 p-2.5 rounded-xl"><Wallet className="w-5 h-5 text-primary" /></div>
                    <div>
                      <h3 className="font-bold text-foreground">Earnings Wallet</h3>
                      <p className="text-xs text-muted-foreground">
                        {userProfile?.user_type === 'business'
                          ? 'Ticket sales + completed service jobs'
                          : 'Available for withdrawal'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-background/50 backdrop-blur-sm text-[10px]">Daily Payouts</Badge>
                </div>
                
                <div className="bg-background/60 backdrop-blur-sm rounded-xl p-4 mb-4 border border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Withdrawable Balance</p>
                  <span className="text-4xl font-black text-foreground tracking-tight">₦{(stats?.walletBalance || 0).toLocaleString()}<span className="text-xl">.00</span></span>
                  {userProfile?.user_type === 'business' && (stats?.serviceRevenue || 0) > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3 text-green-500" />
                      Includes ₦{(stats?.serviceRevenue || 0).toLocaleString()} from {stats?.jobsCompleted} completed {stats?.jobsCompleted === 1 ? 'job' : 'jobs'}
                    </p>
                  )}
                </div>

                <Button 
                  onClick={() => setIsPayoutModalOpen(true)} 
                  disabled={isPayoutLoading || !stats?.walletBalance || stats?.walletBalance < 1000} 
                  className="w-full gradient-primary text-white shadow-md h-12 text-base font-semibold"
                >
                  {isPayoutLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing</>
                  ) : (
                    <><ArrowUpRight className="w-4 h-4 mr-2" /> Request Payout</>
                  )}
                </Button>

                {stats?.walletBalance && stats.walletBalance < 1000 && stats.walletBalance > 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Minimum withdrawal: ₦1,000
                  </p>
                )}
                
                {stats?.walletBalance && stats.walletBalance >= 1000 && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-lg">
                    <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      Ready for payout — funds will be sent to your bank.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* Growth Insights Card */}
            <Card className="border-muted/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  {userProfile?.user_type === 'business' ? 'Business Insights' : 'Growth Insights'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {userProfile?.user_type === 'business' ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Jobs Completed</span>
                      <span className="font-bold">{stats?.jobsCompleted || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Repeat Clients</span>
                      <span className="font-bold">{stats?.repeatClients || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avg Rating</span>
                      <span className="font-bold">
                        {stats?.avgRating != null ? `${stats.avgRating} / 5` : 'No ratings yet'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-bold text-muted-foreground">2%</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Total Service Revenue</span>
                      <span className="font-bold text-green-600">₦{(stats?.serviceRevenue || 0).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-3 border-t border-border">
                      💡 Verified businesses with repeat clients earn 2.4× more per month.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Past Events</span>
                      <span className="font-bold">{stats?.pastEvents || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avg Attendees/Event</span>
                      <span className="font-bold">
                        {stats?.totalHosted && stats.totalHosted > 0
                          ? Math.round((stats.totalAttendees || 0) / stats.totalHosted)
                          : 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-bold text-muted-foreground">2%</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Lifetime Revenue</span>
                      <span className="font-bold text-green-600">₦{(stats?.netRevenue || 0).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-3 border-t border-border">
                      💡 Hosting events consistently helps grow your community 3x faster!
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* --- PAYOUT MODAL --- */}
        <Dialog open={isPayoutModalOpen} onOpenChange={setIsPayoutModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{savedBankDetails ? 'Confirm Payout' : 'Add Bank Details'}</DialogTitle>
              <DialogDescription>
                {savedBankDetails ? 'Review your payout destination below.' : 'Where should we send your earnings?'}
              </DialogDescription>
            </DialogHeader>

            {savedBankDetails ? (
              <div className="space-y-4 py-2">
                 <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3 border border-border">
                    <Building2 className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">{savedBankDetails.bank_name}</p>
                      <p className="text-xs text-muted-foreground">{savedBankDetails.account_name}</p>
                      <p className="text-sm font-mono mt-1 tracking-wider">{savedBankDetails.account_number}</p>
                    </div>
                 </div>
                 
                 <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md text-xs text-yellow-800 dark:text-yellow-200 flex gap-2">
                   <Info className="w-4 h-4 shrink-0" />
                   <span>Payouts are processed daily. You will receive <b>₦{(stats?.walletBalance || 0).toLocaleString()}</b>.</span>
                 </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="bank">Bank Name</Label>
                  <Input 
                    id="bank" 
                    placeholder="e.g. GTBank, Zenith Bank" 
                    value={bankForm.bank_name}
                    onChange={e => setBankForm({...bankForm, bank_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc_num">Account Number</Label>
                  <Input 
                    id="acc_num" 
                    placeholder="0123456789" 
                    maxLength={10}
                    value={bankForm.account_number}
                    onChange={e => setBankForm({...bankForm, account_number: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc_name">Account Name</Label>
                  <Input 
                    id="acc_name" 
                    placeholder="Name on account" 
                    value={bankForm.account_name}
                    onChange={e => setBankForm({...bankForm, account_name: e.target.value})}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {!savedBankDetails ? (
                <Button onClick={saveBankDetails} className="w-full">Save Bank Details</Button>
              ) : (
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={() => navigate('/settings?tab=bank')}>Change Bank</Button>
                  <Button onClick={processPayout} disabled={isPayoutLoading} className="flex-1 gradient-primary text-white">
                    {isPayoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Withdraw'}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
      </div>
    </LaunchZoneGuard>
  );
}
