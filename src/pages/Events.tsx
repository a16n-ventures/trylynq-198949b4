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
  CreditCard
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
import { format, isPast, isFuture, isToday } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; 
import { z } from 'zod';

// --- TYPES ---
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
  action: () => void;
  actionLabel: string;
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
      <Button onClick={action} className="mt-4 gradient-primary text-white shadow-md">
        <Plus className="w-4 h-4 mr-2" /> {actionLabel}
      </Button>
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
  
  // Payout & Modal States
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [bankForm, setBankForm] = useState<BankDetails>({ bank_name: '', account_number: '', account_name: '' }); 

  // 1. Fetch My Events
  const { data: myEvents = [], isLoading: loadingMy } = useQuery<EventWithStats[]>({
    queryKey: ["events", "my", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data: events, error } = await supabase
        .from("events")
        .select(`
          *,
          creator:profiles!creator_id(user_id, display_name, avatar_url)
        `)
        .eq("creator_id", userId)
        .order("start_date", { ascending: true });
      
      if (error) throw error;
      if (!events || events.length === 0) return [];

      const eventIds = events.map(e => e.id);
      const { data: allAttendees, error: countError } = await supabase
        .from("event_attendees")
        .select("event_id")
        .in("event_id", eventIds)
        .eq("status", "confirmed");
      
      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      allAttendees?.forEach(a => {
        countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
      });

      return events.map(event => ({
        ...event,
        attendee_count: countMap[event.id] || 0
      }));
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // 2. Fetch Attending Events
  const { data: attendingEvents = [], isLoading: loadingAttending } = useQuery<EventWithStats[]>({
    queryKey: ["events", "attending", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data: attendees, error: attendeesError } = await supabase
        .from("event_attendees")
        .select("event_id")
        .eq("user_id", userId)
        .eq("status", "confirmed");
      
      if (attendeesError) throw attendeesError;
      if (!attendees || attendees.length === 0) return [];
      
      const eventIds = attendees.map((a) => a.event_id);
      
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select(`
          *,
          creator:profiles!creator_id(user_id, display_name, avatar_url)
        `)
        .in("id", eventIds)
        .order("start_date", { ascending: true });
      
      if (eventsError) throw eventsError;
      if (!events || events.length === 0) return [];

      const { data: allAttendees, error: countError } = await supabase
        .from("event_attendees")
        .select("event_id")
        .in("event_id", eventIds)
        .eq("status", "confirmed");

      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      allAttendees?.forEach(a => {
        countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
      });

      return events.map(event => ({
        ...event,
        attendee_count: countMap[event.id] || 0
      }));
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // 3. Fetch Discover Events
  const { data: discoverEvents = [], isLoading: loadingDiscover } = useQuery<EventWithStats[]>({
    queryKey: ["events", "discover", userId, searchQuery],
    queryFn: async () => {
      if (!userId) return [];
      
      let query = supabase
        .from("events")
        .select(`
          *,
          creator:profiles!creator_id(user_id, display_name, avatar_url)
        `)
        .eq("is_public", true)
        .neq("creator_id", userId)
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(50);

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
      }

      const { data: events, error } = await query;
      
      if (error) throw error;
      if (!events || events.length === 0) return [];

      const eventIds = events.map(e => e.id);
      const { data: allAttendees, error: countError } = await supabase
        .from("event_attendees")
        .select("event_id")
        .in("event_id", eventIds)
        .eq("status", "confirmed");

      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      allAttendees?.forEach(a => {
        countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
      });

      return events.map(event => ({
        ...event,
        attendee_count: countMap[event.id] || 0
      }));
    },
    enabled: !!userId && activeTab === "discover",
    staleTime: 30000,
  });

  // 4. Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ["events", "stats", userId],
    queryFn: async () => {
      if (!userId) return { 
        totalHosted: 0, 
        totalAttendees: 0, 
        upcomingEvents: 0,
        pastEvents: 0,
        netRevenue: 0,
        walletBalance: 0
      };
      
      const { data: myEventsList } = await supabase
        .from('events')
        .select('id, start_date, ticket_price')
        .eq('creator_id', userId);
      
      if (!myEventsList?.length) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();

        return { 
          totalHosted: 0, 
          totalAttendees: 0, 
          upcomingEvents: 0,
          pastEvents: 0,
          netRevenue: 0,
          walletBalance: wallet?.balance || 0
        };
      }
      
      const ids = myEventsList.map(e => e.id);

      const { data: allAttendees } = await supabase
        .from('event_attendees')
        .select('event_id')
        .in('event_id', ids)
        .eq('status', 'confirmed');

      const totalAttendees = allAttendees?.length || 0;

      const countMap: Record<string, number> = {};
      allAttendees?.forEach(a => {
        countMap[a.event_id] = (countMap[a.event_id] || 0) + 1;
      });

      let grossRevenue = 0;
      for (const event of myEventsList) {
        if (event.ticket_price > 0) {
          const count = countMap[event.id] || 0;
          grossRevenue += count * event.ticket_price;
        }
      }
      const netRevenue = grossRevenue * 0.98;

      const upcomingEvents = myEventsList.filter(e => isFuture(new Date(e.start_date))).length;
      const pastEvents = myEventsList.filter(e => isPast(new Date(e.start_date))).length;
      
      let walletBalance = 0;
      try {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();
        
        walletBalance = wallet?.balance || 0;
      } catch (e) {
        console.log("Wallet fetch warning:", e);
      }

      return { 
        totalHosted: myEventsList.length,
        totalAttendees,
        upcomingEvents,
        pastEvents,
        netRevenue, 
        walletBalance 
      };
    },
    enabled: !!userId && activeTab === "analytics",
    staleTime: 60000,
  }); 

    // 5. Fetch Saved Bank Details
  const { data: savedBankDetails, refetch: refetchBank } = useQuery({
    queryKey: ["bank-details", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_bank_details')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
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
      const { error } = await supabase
        .from('user_bank_details')
        .upsert({ 
          user_id: userId,
          ...bankForm,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      await refetchBank();
      toast.success("Bank details saved!");
    } catch (e: any) {
      if (e instanceof z.ZodError) {
      toast.error(e.errors[0].message);
      return;
    }
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
      const { error } = await supabase.functions.invoke('request-payout', {
        body: { amount: stats.walletBalance }
      });

      if (error) {
        const body = await error.context?.json().catch(() => ({}));
        throw new Error(body.error || error.message || "Failed to process payout");
      }
      
      toast.success("Payout request submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["events", "stats", userId] });
      
    } catch (error: any) {
      console.error("Payout error:", error);
      toast.error(error.message || "Failed to request payout");
    } finally {
      setIsPayoutLoading(false);
    }
  };

  const getEventStatus = (startDate: string) => {
    const date = new Date(startDate);
    if (isToday(date)) return { label: 'Today', color: 'bg-green-500' };
    if (isFuture(date)) return { label: 'Upcoming', color: 'bg-blue-500' };
    return { label: 'Past', color: 'bg-gray-500' };
  };

  const shareEvent = async (event: Event) => {
    const shareData = {
      title: event.title,
      text: `Check out this event: ${event.title}`,
      url: `${window.location.origin}/events/${event.id}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Event link copied!');
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const renderEventCard = (event: EventWithStats, type: 'mine' | 'attending' | 'discover') => {
    const status = getEventStatus(event.start_date);
    const eventDate = new Date(event.start_date);
    const isFull = event.max_attendees && event.attendee_count ? event.attendee_count >= event.max_attendees : false;

    return (
      <Card 
        key={event.id} 
        className="overflow-hidden hover:shadow-lg transition-all border-border/60 cursor-pointer group"
        onClick={() => navigate(`/events/${event.id}`)}
      >
        <CardContent className="p-0">
          <div className="flex h-36">
            <div className="w-28 bg-gradient-to-br from-purple-600 to-blue-600 relative overflow-hidden">
              {event.image_url ? (
                <img 
                  src={event.image_url} 
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
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
                  <span className="text-xs opacity-75">
                    {format(eventDate, 'HH:mm')}
                  </span>
                </div>
              )}
              
              <Badge 
                className="absolute top-2 left-2 text-[10px] px-2 py-0.5"
                variant={event.event_type === 'virtual' ? 'default' : 'secondary'}
              >
                {event.event_type === 'virtual' ? (
                  <><Video className="w-3 h-3 mr-1" /> Virtual</>
                ) : (
                  <><MapPinned className="w-3 h-3 mr-1" /> Physical</>
                )}
              </Badge>
            </div>

            <div className="flex-1 p-4 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-base leading-tight mb-1">
                      {event.title}
                    </h3>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {event.category}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {event.ticket_price > 0 ? (
                      <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                        ₦{event.ticket_price}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        Free
                      </Badge>
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
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="w-3 h-3 shrink-0" />
                    <span>
                      {event.attendee_count || 0} attending
                      {event.max_attendees && ` • ${event.max_attendees} max`}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-3">
                {type === 'mine' ? (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/events/${event.id}`);
                      }}
                    >
                      <Edit className="w-3 h-3 mr-1" /> Manage
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        shareEvent(event);
                      }}
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                  </>
                ) : type === 'attending' ? (
                  <Button 
                    size="sm" 
                    className="h-7 text-xs w-full gradient-primary text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/events/${event.id}`);
                    }}
                  >
                    <Ticket className="w-3 h-3 mr-1" /> View Details
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    className="h-7 text-xs w-full"
                    variant={isFull ? "outline" : "default"}
                    disabled={isFull}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/events/${event.id}`);
                    }}
                  >
                    {isFull ? 'Event Full' : 'View & RSVP'}
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
        <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="my" className="rounded-lg text-xs">Hosted</TabsTrigger>
          <TabsTrigger value="attending" className="rounded-lg text-xs">Attending</TabsTrigger>
          <TabsTrigger value="discover" className="rounded-lg text-xs">Discover</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg text-xs">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-3 mt-6 animate-in fade-in-50">
          {loadingMy ? (
            <EventSkeleton />
          ) : filteredMyEvents.length === 0 ? (
            <EmptyState
              title="No Hosted Events"
              description={searchQuery 
                ? "No events match your search. Try different keywords." 
                : "You haven't created any events yet. Start hosting to build your community!"
              }
              action={() => navigate('/create-event')}
              actionLabel="Create Event"
            />
          ) : (
            <div className="space-y-3">
              {filteredMyEvents.map(e => renderEventCard(e, 'mine'))}
            </div>
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

        <TabsContent value="discover" className="space-y-3 mt-6 animate-in fade-in-50">
          {loadingDiscover ? (
            <EventSkeleton />
          ) : discoverEvents.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-muted rounded-xl bg-muted/5">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">
                {searchQuery 
                  ? "No events match your search. Try different keywords."
                  : "No upcoming public events found. Check back later!"
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {discoverEvents.map(e => renderEventCard(e, 'discover'))}
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
            
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 p-3 rounded-xl">
                    <Wallet className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground">Earnings Wallet</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Available for daily payout</p>
                    </div>
                  </div>
                </div>
                { /* 
                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm border border-primary/20">
                  <Check className="w-3 h-3 mr-1" />
                  Daily Payouts
                </Badge>
                */ }
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Withdrawable Balance
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-foreground tracking-tight">
                      ₦{(stats?.walletBalance || 0).toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">.00</span>
                  </div>
                  { /* {stats?.walletBalance && stats.walletBalance < 1000 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Minimum ₦1,000 required
                    </p> 
                  )} */ }
                </div>

                <Button onClick={() => setIsPayoutModalOpen(true)} disabled={isPayoutLoading || !stats?.walletBalance || stats?.walletBalance < 1000} className="gradient-primary text-white shadow-md shrink-0">
                  {isPayoutLoading ? ( <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing </> ) : ( <><ArrowUpRight className="w-4 h-4 ml-1" /> Request Payout </> )}
                </Button>

                <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[9px] h-5 px-2 text-muted-foreground hover:bg-muted">
                              <Info className="w-3 h-3 mr-1" />
                              -2% Platform fee
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>A 2% platform fee is automatically deducted from all ticket sales. The balance shown is your net amount after fees.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                
              </div>

              {stats?.walletBalance && stats?.walletBalance >= 1000 && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-lg">
                  <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Payout will be processed shortly into your registered bank account
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
