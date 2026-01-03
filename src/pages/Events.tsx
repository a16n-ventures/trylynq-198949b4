import { useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; 
import { z } from 'zod';

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
          <div className="w-24 h-32 rounded-l bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-muted/50 animate-pulse rounded" />
            <div className="h-4 w-1/3 bg-muted/50 animate-pulse rounded" />
            <div className="h-8 w-24 bg-muted animate-pulse rounded mt-2" />
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

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my");
  const [hostedFilter, setHostedFilter] = useState<'active' | 'past'>('active');
  
  // Payout & Modal States
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [bankForm, setBankForm] = useState<BankDetails>({ bank_name: '', account_number: '', account_name: '' }); 

  // --- HELPER: Logic to check if an event is still "Active" ---
  // ✅ CHANGED: Allow events to remain active for 3 hours after start time
  const isEventActive = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();
    // Event is active until 3 hours after start time
    const expirationTime = addHours(eventDate, 3);
    return expirationTime > now;
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

      return events.map((event: any) => ({
        ...event,
        event_type: (event.event_type as 'physical' | 'virtual') || 'physical',
        attendee_count: countMap[event.id] || 0,
        is_boosted: checkBoostPermission(event.creator_id, premiums, subs)
      }));
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

      return events.map((event: any) => ({
        ...event,
        attendee_count: countMap[event.id] || 0,
        is_boosted: checkBoostPermission(event.creator_id, premiums, subs)
      })).sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // 3. Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ["events", "stats", userId],
    queryFn: async () => {
      if (!userId) return { 
        totalHosted: 0, totalAttendees: 0, upcomingEvents: 0, pastEvents: 0, netRevenue: 0, walletBalance: 0
      };
      
      const { data: myEventsList } = await supabase.from('events').select('id, start_date, ticket_price').eq('creator_id', userId);
      
      let walletBalance = 0;
      const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
      if (wallet) walletBalance = wallet.balance;

      if (!myEventsList?.length) return { totalHosted: 0, totalAttendees: 0, upcomingEvents: 0, pastEvents: 0, netRevenue: 0, walletBalance };
      
      const ids = myEventsList.map(e => e.id);
      const { data: allAttendees } = await supabase.from('event_attendees').select('event_id').in('event_id', ids).eq('status', 'confirmed');

      const totalAttendees = allAttendees?.length || 0;
      const countMap: Record<string, number> = {};
      allAttendees?.forEach(a => countMap[a.event_id] = (countMap[a.event_id] || 0) + 1);

      let grossRevenue = 0;
      for (const event of myEventsList) {
        if (event.ticket_price > 0) grossRevenue += (countMap[event.id] || 0) * event.ticket_price;
      }

      const upcomingEvents = myEventsList.filter(e => isFuture(new Date(e.start_date))).length;
      const pastEvents = myEventsList.filter(e => isPast(new Date(e.start_date))).length;
      
      return { 
        totalHosted: myEventsList.length,
        totalAttendees,
        upcomingEvents,
        pastEvents,
        netRevenue: grossRevenue * 0.98, 
        walletBalance 
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
    const expirationTime = addHours(date, 3); // 3-hour duration assumption

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
    const isFull = event.max_attendees && event.attendee_count ? event.attendee_count >= event.max_attendees : false;
    
    const isStillActive = isEventActive(event.start_date);
    const isEventPast = !isStillActive;
    
    // Explicitly check for pending status
    const isPending = event.my_status === 'pending';

    return (
      <Card 
        key={event.id} 
        className={`overflow-hidden hover:shadow-lg transition-all border-border/60 cursor-pointer group ${isPending ? 'border-yellow-200 bg-yellow-50/10' : ''}`}
        onClick={() => navigate(`/app/events/${event.id}`)}
      >
        <CardContent className="p-0">
          <div className="flex h-46">
            {/* Image Section */}
            <div className="w-28 bg-gradient-to-br from-purple-600 to-blue-600 relative overflow-hidden">
              {event.image_url ? (
                <img 
                  src={event.image_url} 
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${isPending || isEventPast ? 'grayscale-[50%]' : 'group-hover:scale-110'}`}
                  alt={event.title}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-90">
                    {format(eventDate, 'MMM')}
                  </span>
                  <span className="text-3xl font-bold">
                    {format(eventDate, 'd')}
                  </span>
                </div>
              )}
              
              {/* Type Badge */}
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                <Badge 
                  className="text-[10px] px-2 py-0.5 backdrop-blur-md"
                  variant={event.event_type === 'virtual' ? 'default' : 'secondary'}
                >
                  {event.event_type === 'virtual' ? <Video className="w-3 h-3" /> : <MapPinned className="w-3 h-3" />}
                </Badge>
              </div>

               {/* Boosted Zap Icon */}
               {event.is_boosted && !isEventPast && (
                <div className="absolute top-0 right-0 bg-yellow-400 text-white rounded-bl-lg p-1.5 shadow-sm z-10 animate-pulse">
                  <Zap className="w-3 h-3 fill-white" />
                </div>
              )}

              {/* Pending Overlay Badge */}
              {isPending && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-0">
                    Pending
                  </Badge>
                </div>
              )}
            </div>

            {/* Content Section */}
            <div className="flex-1 p-4 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-base leading-tight mb-1">
                      {event.title}
                    </h3>
                    <div className="flex items-center flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {event.category}
                        </Badge>
                        {isPending && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-700 border-yellow-300 bg-yellow-100">
                                Awaiting Approval
                            </Badge>
                        )}
                        {/* ✅ Display 'Happening Now' or 'Expiring' badges if active but started */}
                        {isStillActive && isPast(eventDate) && (
                            <Badge className={`text-[10px] px-1.5 py-0 border-0 text-white ${status.color}`}>
                                {status.label === 'Expiring Soon' && <Hourglass className="w-3 h-3 mr-1" />}
                                {status.label}
                            </Badge>
                        )}
                    </div>
                  </div>
                  
                  {/* Price & Status Dot */}
                  <div className="flex flex-col items-end gap-1">
                    {event.ticket_price > 0 ? (
                      <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                        ₦{event.ticket_price.toLocaleString()}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">Free</Badge>
                    )}
                    <div className={`w-2 h-2 rounded-full ${status.color}`} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {format(eventDate, 'EEE, MMM d • h:mm a')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-3">
                {type === 'mine' ? (
                  <>
                    <Button 
                      size="sm" variant="outline" className="h-7 text-xs flex-1"
                      onClick={(e) => { e.stopPropagation(); navigate(`/app/events/${event.id}`); }}
                    >
                      <Edit className="w-3 h-3 mr-1" /> Manage
                    </Button>
                    <Button 
                      size="sm" variant="ghost" className="h-7 px-2"
                      onClick={(e) => { e.stopPropagation(); shareEvent(event); }}
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                  </>
                ) : type === 'attending' ? (
                  <Button 
                    size="sm" 
                    className={`h-7 text-xs w-full shadow-sm ${
                      isPending 
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white' 
                        : isEventPast 
                        ? 'bg-muted text-muted-foreground' 
                        : 'gradient-primary text-white'
                    }`}
                    disabled={isEventPast}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isEventPast) navigate(`/app/events/${event.id}`);
                    }}
                  >
                    {isEventPast ? (
                        <>Event Ended</>
                    ) : isPending ? (
                         <><Clock className="w-3 h-3 mr-1" /> Approval Pending</>
                    ) : (
                         <><Ticket className="w-3 h-3 mr-1" /> View Ticket</>
                    )}
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    className="h-7 text-xs w-full"
                    variant={isFull || isEventPast ? "outline" : "default"}
                    disabled={isFull || isEventPast}
                    onClick={(e) => { e.stopPropagation(); navigate(`/app/events/${event.id}`); }}
                  >
                    {isEventPast ? 'Event Ended' : isFull ? 'Event Full' : 'View Details'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const filterEvents = (events: EventWithStats[]) => {
    if (!searchQuery) return events;
    return events.filter(event => 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredMyEvents = filterEvents(myEvents);
  
  // Active Filter with Grace Period
  const myActiveEvents = filteredMyEvents.filter(e => isEventActive(e.start_date));
  const myPastEvents = filteredMyEvents.filter(e => !isEventActive(e.start_date));
  
  const filteredAttendingEvents = filterEvents(attendingEvents);

  return (
    <div className="container-mobile py-4 space-y-6 pb-24">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Events</h1>
        <Button 
          onClick={() => navigate('/create-event')} 
          size="sm" 
          className="gradient-primary text-white rounded-full shadow-md gap-1"
        >
          <Plus className="w-4 h-4" /> Create
        </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="my" className="rounded-lg text-xs">Hosted</TabsTrigger>
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

        <TabsContent value="analytics" className="space-y-4 mt-6 animate-in fade-in-50">
          <div className="grid grid-cols-2 gap-3">
            <Card className="gradient-card border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                <div className="bg-primary/10 p-2 rounded-full mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <span className="text-2xl font-bold">{stats?.totalHosted || 0}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total Hosted
                </span>
              </CardContent>
            </Card>

            <Card className="gradient-card border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                <div className="bg-blue-100 p-2 rounded-full mb-2">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-2xl font-bold">{stats?.totalAttendees || 0}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total Attendees
                </span>
              </CardContent>
            </Card>

            <Card className="gradient-card border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                <div className="bg-green-100 p-2 rounded-full mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-2xl font-bold">{stats?.upcomingEvents || 0}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Upcoming
                </span>
              </CardContent>
            </Card>

            <Card className="gradient-card border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-28">
                <div className="bg-purple-100 p-2 rounded-full mb-2">
                  <Ticket className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-2xl font-bold">
                  ₦{(stats?.netRevenue || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  Net Earnings
                </span>
              </CardContent>
            </Card>
          </div>
          
          {/* PAYOUT WALLET CARD */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5 shadow-md overflow-hidden relative">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-10 -bottom-10 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
            
                        <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/20 p-2 rounded-lg"><Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Earnings Wallet</h3>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">Available for daily payout</p>
                      <TooltipProvider>                           <Tooltip>
                        <TooltipTrigger>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">-2% Fee</Badge>
                        </TooltipTrigger>                           <TooltipContent>
                          <p>A 2% platform fee is deducted from all ticket sales.</p>                          </TooltipContent>
                      </Tooltip>                                </TooltipProvider>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">Daily Payouts</Badge>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Withdrawable Balance</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground tracking-tight">₦{(stats?.walletBalance || 0).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground font-medium">.00</span>
                  </div>
                </div>

                <Button onClick={() => setIsPayoutModalOpen(true)} disabled={isPayoutLoading || !stats?.walletBalance || stats?.walletBalance < 1000} className="gradient-primary text-white shadow-md shrink-0">
                  {isPayoutLoading ? ( <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing </> ) : ( <><ArrowUpRight className="w-4 h-4 ml-1" /> Request Payout </> )}
                </Button>
                
                </div>

              {stats?.walletBalance && stats?.walletBalance >= 1000 && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-lg">
                  <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Payout will be sent to your bank account shortly.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Growth Insights Card */}
          <Card className="border-muted/50 shadow-sm bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Growth Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Past Events</span>
                <span className="font-semibold">{stats?.pastEvents || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Attendees/Event</span>
                <span className="font-semibold">
                  {stats?.totalHosted && stats.totalHosted > 0
                    ? Math.round((stats.totalAttendees || 0) / stats.totalHosted)
                    : 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Success Rate</span>
                <span className="font-semibold text-green-600">
                  {stats?.totalHosted && stats.totalHosted > 0
                    ? Math.round((stats.upcomingEvents / stats.totalHosted) * 100)
                    : 0}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-3 border-t border-border">
                💡 Tip: Hosting events consistently helps grow your community 3x faster!
              </p>
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
  );
}