import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Search, MapPin, Calendar, Users, Plus, 
  MessageCircle, Loader2, Sparkles, Ticket, 
  Clock, Check, Megaphone, SlidersHorizontal, Repeat,
  ArrowRight, Music, Martini, Palette, Zap, Lock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { Bell } from 'lucide-react';

// --- TYPES ---
interface Event { 
  id: string; 
  title: string;
  start_date: string;
  end_date?: string;
  location: string | null; 
  image_url?: string; 
  match_score?: number;
  description?: string;
  ticket_price?: number;
  attendee_count?: number;
  is_attending?: boolean;
  is_sponsored?: boolean;
  recurrence_rule?: string;
  category?: string;
  friend_images?: string[]; 
}

interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
  cover_url?: string | null;
  is_member?: boolean;
  is_premium?: boolean;
  join_fee?: number;
}

// --- HELPER: Calendar Sync ---
const addToCalendar = (event: Event) => {
  const start = new Date(event.start_date).toISOString().replace(/-|:|\.\d\d\d/g, "");
  const end = event.end_date 
    ? new Date(event.end_date).toISOString().replace(/-|:|\.\d\d\d/g, "") 
    : new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");

  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${start}/${end}&details=${encodeURIComponent(event.description || "")}&location=${encodeURIComponent(event.location || "")}`;
  window.open(googleUrl, '_blank');
  toast.success("Opening Calendar...");
};

const getEventStatus = (startDate: string) => {
  const date = new Date(startDate);
  const now = new Date();
  const expirationTime = addHours(date, 3); 

  if (isPast(date) && now < expirationTime) return { label: 'Happening Now', color: 'bg-green-600' };
  if (isToday(date)) return { label: 'Today', color: 'bg-blue-500' };
  if (isFuture(date)) {
    const hoursUntil = differenceInMinutes(date, now) / 60;
    if (hoursUntil <= 24) return { label: 'Soon', color: 'bg-amber-500' };
    return { label: 'Upcoming', color: 'bg-primary' };
  }
  return { label: 'Past', color: 'bg-muted' };
};

// --- COMPONENT START ---
const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadCount } = useRealtimeNotifications(user?.id);

  // FIX: Declare location BEFORE it is used in the queryKey below
  const { location, isLoading: locationLoading, error: locationError } = useGeolocation();
  
  // Data State
  const [communities, setCommunities] = useState<Community[]>([]);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationName, setLocationName] = useState("Detecting...");

  // FIX: Use React Query for events to prevent flickering.
  // queryFn is defined inline so it's always in scope and can close over `location`.
  const FEED_QUERY_KEY = ['smart-feed', user?.id, location?.latitude?.toFixed(2), location?.longitude?.toFixed(2)];

    // 1. Unified Query for the entire backend response
  const { data: feedData, isLoading: loading } = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { 
          user_id: user?.id, 
          user_lat: location?.latitude, 
          user_long: location?.longitude, 
          city: locationName 
        }
      });
      if (error) throw error;
      return data; // This returns the { events, communities, milestone } object
    },
    enabled: !!user && !!location,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Extract variables safely BELOW the hook
  const events = feedData?.events || [];
  const milestone = feedData?.milestone;
  const currentCount = milestone?.current || 0;
  const targetCount = milestone?.target || 500;
  const cityName = milestone?.zone_name || locationName;
  
  // UI State
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // Fetch discovery radius from profile preferences
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-prefs', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('preferences').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const discoveryRadiusKm = useMemo(() => {
    const prefs = userProfile?.preferences as { discovery_radius?: number } | null;
    return (prefs?.discovery_radius ?? 25000) / 1000; // Default 25km
  }, [userProfile]);

  // --- INITIALIZATION & REALTIME ---
  useEffect(() => {
  if (!user) return;
  checkPremium();

  const channel = supabase
    .channel('feed-updates')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'events' }, 
      () => {
        // This clears the cache and forces a fresh background fetch
        queryClient.invalidateQueries({ queryKey: ['smart-feed'] });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [user, queryClient]); 

  // --- FETCH FRIENDS FOR MODAL ---
  useEffect(() => {
    if (!selectedEvent?.id || !user) return;
  
    const fetchFriendsGoing = async () => {
      try {
        // 1. Get my friend IDs
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const friendIds = friendships?.map((f: any) => 
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        ) || [];
  
        if (friendIds.length === 0) return;
  
        // 2. Get attendees who are my friends
        const { data: attendees } = await supabase
          .from('event_attendees')
          .select('user_id')
          .eq('event_id', selectedEvent.id)
          .eq('status', 'confirmed')
          .in('user_id', friendIds);
  
        if (!attendees || attendees.length === 0) return;
  
        const attendeeIds = attendees.map((a: any) => a.user_id);
  
        // 3. Fetch their profiles/avatars
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, avatar_url')
          .in('user_id', attendeeIds)
          .limit(5);
  
        if (profiles && profiles.length > 0) {
          const avatars = profiles.map((p: any) => p.avatar_url).filter(Boolean);
          
          // 4. Update selected event state
          setSelectedEvent(prev => {
            if (!prev || prev.id !== selectedEvent.id) return prev;
            return { ...prev, friend_images: avatars };
          });
        }
      } catch (error) {
        console.error('Error fetching friends going:', error);
      }
    };
  
    fetchFriendsGoing();
  }, [selectedEvent?.id, user?.id]); 

  const checkPremium = async () => {
    if (!user?.id) return;
    const [{ data: subData }, { data: featureData }] = await Promise.all([
      supabase.from('subscriptions').select('status').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      supabase.from('premium_features').select('feature_type').eq('user_id', user.id).eq('is_active', true).gt('expires_at', new Date().toISOString()).limit(1)
    ]);
    setIsPremium(!!subData || (featureData && featureData.length > 0));
  };

  // --- RSVP (RSVP first, then prompt payment for paid events) ---
  const handleRSVP = async (eventId: string) => {
    if (!user) return toast.error("Please sign in to RSVP");
    
    const targetEvent = events.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) {
      toast.error("Event not found");
      return;
    }
    
    const isCurrentlyAttending = targetEvent.is_attending;
    const newStatus = !isCurrentlyAttending;
    const modifier = newStatus ? 1 : -1;
  
    const updateEventState = (e: Event): Event => ({
      ...e,
      is_attending: newStatus,
      attendee_count: Math.max(0, (e.attendee_count || 0) + modifier)
    });
  
    // FIX: Use queryClient.setQueryData for optimistic updates instead of setEvents
    queryClient.setQueryData<Event[]>(FEED_QUERY_KEY, (prev = []) =>
      prev.map(e => e.id === eventId ? updateEventState(e) : e)
    );
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(prev => prev ? updateEventState(prev) : null);
    }
  
    try {
      if (newStatus) {
        // RSVP first
        const { error } = await supabase
          .from('event_attendees')
          .insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        if (error) throw error;
        toast.success("You're going! 🎉");
        
        // Then prompt payment for paid events
        if (targetEvent.ticket_price && targetEvent.ticket_price > 0) {
          const flwKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
          if (flwKey && (window as any).FlutterwaveCheckout) {
            (window as any).FlutterwaveCheckout({
              public_key: flwKey,
              tx_ref: `event-${eventId}-${user.id}-${Date.now()}`,
              amount: targetEvent.ticket_price,
              currency: "NGN",
              payment_options: "card, banktransfer, ussd",
              customer: { email: user.email || "user@app.com", name: user.email || "User" },
              customizations: {
                title: "Event Ticket",
                description: `Ticket: ${targetEvent.title}`,
                logo: "",
              },
              callback: async (response: any) => {
                try {
                  await supabase.from('payments').insert({
                    user_id: user.id,
                    amount: targetEvent.ticket_price!,
                    status: 'success',
                    tx_ref: `event-${eventId}-${user.id}-${Date.now()}`,
                    flw_ref: response.flw_ref || response.transaction_id?.toString(),
                  });
                  toast.success("Payment confirmed! 🎉");
                } catch (err: any) {
                  console.error('Payment record error:', err);
                }
              },
              onclose: () => {},
            });
          }
        }

        navigate(`/app/messages?type=event&id=${eventId}`);
      } else {
        const { error } = await supabase
          .from('event_attendees')
          .delete()
          .match({ event_id: eventId, user_id: user.id });
        if (error) throw error;
        toast.success("RSVP Cancelled");
      }
    } catch (e: any) {
      console.error('RSVP Failed:', e);
      toast.error(e.message || "Action failed");
      
      // FIX: Revert optimistic update via queryClient
      const revertEventState = (ev: Event): Event => ({
        ...ev,
        is_attending: isCurrentlyAttending,
        attendee_count: Math.max(0, (ev.attendee_count || 0) - modifier)
      });
      
      queryClient.setQueryData<Event[]>(FEED_QUERY_KEY, (prev = []) =>
        prev.map(e => e.id === eventId ? revertEventState(e) : e)
      );
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(prev => prev ? revertEventState(prev) : null);
      }
    }
  };

  // --- FILTER LOGIC ---
  const getFilteredEvents = () => {
    let filtered = events;
    if (searchQuery) {
        filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    switch (activeTab) {
        case 'for_you': return filtered;
        case 'trending': return filtered.filter(e => (e.attendee_count || 0) > 10 || (e.match_score && e.match_score > 80));
        case 'music': return filtered.filter(e => e.category?.toLowerCase().includes('music') || e.description?.toLowerCase().includes('music'));
        case 'nightlife': return filtered.filter(e => e.category?.toLowerCase().includes('nightlife') || e.category?.toLowerCase().includes('party') || e.title.toLowerCase().includes('party'));
        case 'tech': return filtered.filter(e => e.category?.toLowerCase().includes('tech') || e.title.toLowerCase().includes('tech'));
        case 'sports': return filtered.filter(e => e.category?.toLowerCase().includes('sports') || e.category?.toLowerCase().includes('fitness'));
        case 'food': return filtered.filter(e => e.category?.toLowerCase().includes('food') || e.category?.toLowerCase().includes('drink'));
        case 'art': return filtered.filter(e => e.category?.toLowerCase().includes('art') || e.category?.toLowerCase().includes('culture'));
        default: return filtered;
    }
  };

  const displayEvents = getFilteredEvents();

  return (
    <div className="min-h-screen bg-background pb-24">
      
      {/* 1. HEADER (Fixed Top) */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b pb-0">
        <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
            <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                Discover <span className="text-primary">{locationName}</span>
                </h1>
                <p className="text-xs text-muted-foreground">Find your vibe for today</p>
            </div>
            <div className="flex items-center gap-2">
              {isPremium && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  <Sparkles className="w-3 h-3 mr-1" /> Premium
                </Badge>
              )}
              <Button 
                size="icon" 
                variant="ghost" 
                className="rounded-full relative"
                onClick={() => navigate('/app/notifications')}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </div>
            </div>

            <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                    placeholder="Search events, vibes, people..." 
                    className="pl-9 bg-muted/50 border-0 rounded-xl"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>

        {/* 2. CATEGORY TABS (Scrollable) */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="w-full overflow-x-auto scrollbar-hide px-4 pb-3">
                <TabsList className="bg-transparent p-0 gap-2 h-auto flex justify-start">
                    <TabsTrigger value="for_you" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Sparkles className="w-3 h-3 mr-1.5" /> For You
                    </TabsTrigger>
                    <TabsTrigger value="trending" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Zap className="w-3 h-3 mr-1.5" /> Trending
                    </TabsTrigger>
                    <TabsTrigger value="communities" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Users className="w-3 h-3 mr-1.5" /> Communities
                    </TabsTrigger>
                    <TabsTrigger value="music" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Music className="w-3 h-3 mr-1.5" /> Music
                    </TabsTrigger>
                    <TabsTrigger value="nightlife" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Martini className="w-3 h-3 mr-1.5" /> Nightlife
                    </TabsTrigger>
                    <TabsTrigger value="tech" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Zap className="w-3 h-3 mr-1.5" /> Tech
                    </TabsTrigger>
                    <TabsTrigger value="sports" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Users className="w-3 h-3 mr-1.5" /> Sports
                    </TabsTrigger>
                    <TabsTrigger value="food" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Sparkles className="w-3 h-3 mr-1.5" /> Food
                    </TabsTrigger>
                    <TabsTrigger value="art" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Palette className="w-3 h-3 mr-1.5" /> Art
                    </TabsTrigger>
                </TabsList>
            </div>

            {/* CONTENT AREA */}
     <div className="container-mobile py-2 space-y-6"> 
    
    {/* A. PREMIUM SECTION */}
    {isPremium && activeTab === 'for_you' && (
        <div className="mx-4 mt-2 space-y-3">
          <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/15 via-primary/10 to-purple-500/15 border border-amber-300/30 dark:border-amber-700/30 rounded-2xl p-4 shadow-sm">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-400/10 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">Premium Member <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-[9px] px-1.5">VIP</Badge></p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ad-free · {discoveryRadiusKm}km radius · Priority discovery · AI insights</p>
              </div>
            </div>
          </div>

          {aiInsights && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-xs text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-1">AI Vibe Check</h3>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">{aiInsights}</p>
                  </div>
                </div>
            </div>
          )} 
        </div>
    )}

    {/* B. WAITING ROOM / MILESTONE UI (Zaria Support) */}
    {activeTab === 'for_you' && feedData?.milestone?.zone_name !== 'Global' && feedData?.milestone?.is_unlocked === false && (
      <div className="mx-4 mb-8 p-6 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-3xl border-2 border-dashed border-primary/30 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h2 className="text-2xl font-black mb-2 italic uppercase">{cityName} IS LOADING...</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ahmia goes live once <span className="text-foreground font-bold">500 Pioneers</span> join. 
          Social features are currently in "Stealth Mode."
        </p>

        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
            <span>{locationName} Pioneers</span>
            {/* Replace 342 / 500 with: */}
            <span className="text-primary">
              {feedData?.milestone?.current || 0} / {feedData?.milestone?.target || 500}
            </span> 

          </div>
          <div className="h-4 w-full bg-muted rounded-full overflow-hidden border">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--primary),0.5)]" 
              style={{ width: `${Math.min(((feedData?.milestone?.current || 0) / (feedData?.milestone?.target || 500)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <Button 
          className="w-full h-12 rounded-2xl shadow-lg hover:scale-105 transition-transform font-bold"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: `Unlock Ahmia in ${cityName}!`,
                // Dynamically inject the current count and target
                text: `I'm pioneer #${currentCount} in ${cityName}. Help us hit ${targetCount} to unlock the city!`,
                url: window.location.origin
              });
            }
          }}
        >
          <Users className="w-5 h-5 mr-2" /> Invite Friends to Speed Up
        </Button>
      </div>
    )}
    
    {/* 2. Case B: NOT IN A SUPPORTED CITY (activeZone was NULL) */}
    {activeTab === 'for_you' && feedData?.milestone?.zone_name === 'Global' && (
      <div className="mx-4 mb-8 p-6 bg-muted/30 rounded-3xl border-2 border-dotted border-muted-foreground/20 text-center">
        <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
          <MapPin className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Not available in {locationName}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Coming soon to your location. We are currently focusing on campus hubs!
        </p>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full text-[10px]"
          onClick={() => navigate('/app/feed?tab=communities')}
        >
          <Globe className="w-3 h-3 mr-2" /> Explore Global Communities
        </Button>
      </div>
    )}

    {/* C. MAIN FEED CONTENT */}
    <TabsContent 
      value={activeTab} 
      className={`mt-0 space-y-5 px-4 min-h-[50vh] transition-all ${activeTab === 'for_you' && milestone?.is_unlocked === false ? "opacity-40 grayscale blur-[1px]" : ""}
    >
      {activeTab === 'communities' ? (
                        // COMMUNITIES VIEW
                        <div className="space-y-3">
                            {loading ? (
                                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : communities.length === 0 ? (
                                <div className="text-center py-16 flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                        <Users className="w-8 h-8 text-muted-foreground/40" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">No communities yet</p>
                                        <p className="text-sm text-muted-foreground">Be the first to create one!</p>
                                    </div>
                                </div>
                            ) : communities.map(c => (
                            <div key={c.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border shadow-sm cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setSelectedCommunity(c)}>
                                <Avatar className="h-14 w-14 rounded-xl border">
                                <AvatarImage src={c.avatar_url || undefined} className="object-cover" />
                                <AvatarFallback>{c.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold truncate">{c.name}</h4>
                                  {c.is_premium && (
                                    <Badge className="bg-amber-500 text-white border-0 text-[10px] px-1.5 py-0">Exclusive</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                                    <Users className="w-3 h-3" /> {c.member_count} members
                                </div>
                                </div>
                                <Button size="icon" variant="ghost"><ArrowRight className="w-5 h-5 text-muted-foreground" /></Button>
                            </div>
                            ))}
                        </div>
                    ) : (
                        // EVENTS VIEW (Generic for all event tabs)
                        <>
                            {loading ? (
                                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : displayEvents.length === 0 ? (
                                <div className="text-center py-16 flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                                        <Calendar className="w-10 h-10 text-muted-foreground/30" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-base">No events for this vibe yet</p>
                                        <p className="text-sm text-muted-foreground mt-1">Be the first to create one in your area!</p>
                                    </div>
                                    <Button 
                                        className="rounded-full px-6 gap-2 shadow-md"
                                        onClick={() => navigate('/app/events/create')}
                                    >
                                        <Plus className="w-4 h-4" /> Create Event
                                    </Button>
                                </div>
                            ) : (
                                displayEvents.map((event) => {
                                    const status = getEventStatus(event.start_date);
                                    
                                    return (
                                    <Card key={event.id} className="overflow-hidden border-0 shadow-md group cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setSelectedEvent(event)}>
                                        <div className="relative h-48 w-full bg-muted">
                                        <img src={event.image_url || '/placeholder-event.jpg'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        
                                        <div className="absolute top-3 left-3 flex gap-2">
                                            <Badge className={`${status.color} text-white border-0 shadow-sm backdrop-blur-md`}>
                                            {status.label}
                                            </Badge>
                                            {event.match_score && event.match_score > 80 && (
                                            <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                                                <Sparkles className="w-3 h-3 mr-1 text-yellow-400" /> {event.match_score}% Match
                                            </Badge>
                                            )}
                                        </div>

                                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-black px-2.5 py-1.5 rounded-lg text-center shadow-sm min-w-[50px]">
                                            <span className="block text-xs font-bold uppercase text-red-500">{new Date(event.start_date).toLocaleString('default', { month: 'short' })}</span>
                                            <span className="block text-lg font-black leading-none">{new Date(event.start_date).getDate()}</span>
                                        </div>
                                        </div>

                                        <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                            <h3 className="font-bold text-lg leading-tight mb-1 line-clamp-2">{event.title}</h3>
                                            <div className="flex items-center text-xs text-muted-foreground gap-3">
                                                <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {event.location || "TBD"}</span>
                                                <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {new Date(event.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            </div>
                                        </div>

                                        {/* SOCIAL PROOF & ACTION */}
                                        <div className="mt-4 flex items-center justify-between">
                                            <div className="flex items-center -space-x-2">
                                            {(event.friend_images || []).slice(0, 3).map((img, i) => (
                                                <Avatar key={i} className="w-7 h-7 border-2 border-background">
                                                <AvatarImage src={img} />
                                                <AvatarFallback>?</AvatarFallback>
                                                </Avatar>
                                            ))}
                                            <div className="text-xs text-muted-foreground pl-3 font-medium">
                                                {event.friend_images?.length ? 
                                                <span className="text-foreground">{event.friend_images.length} {event.friend_images.length === 1 ? 'friend is' : 'friends are'} going</span> : 
                                                <span>{event.attendee_count || 0} attending</span>
                                                }
                                            </div>
                                            </div>

                                            <div className="flex gap-2">
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                className="h-8 w-8 rounded-full p-0 bg-muted hover:bg-muted/80"
                                                onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/app/messages?type=event&id=${event.id}`);
                                                }}
                                            >
                                                <MessageCircle className="w-4 h-4 text-primary" />
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                className={`h-8 rounded-full px-4 shadow-sm ${event.is_attending ? "bg-green-600 hover:bg-green-700" : ""}`}
                                                onClick={(e) => {
                                                e.stopPropagation();
                                                handleRSVP(event.id);
                                                }}
                                            >
                                                {event.is_attending ? "Going" : event.ticket_price && event.ticket_price > 0 ? `₦${event.ticket_price.toLocaleString()}` : "RSVP"}
                                            </Button>
                                            </div>
                                        </div>
                                        </CardContent>
                                    </Card>
                                    );
                                })
                            )}
                        </>
                    )}
                </TabsContent>
            </div>
        </Tabs>
      </div>

      {/* 3. EVENT DETAIL MODAL */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="p-0 overflow-hidden sm:max-w-[420px] border-0">
            <div className="relative h-64 w-full">
              <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 text-white hover:bg-white/20 rounded-full"
                onClick={() => setSelectedEvent(null)}
              >
                <ArrowRight className="w-6 h-6 rotate-180" />
              </Button>

              <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md mb-2">
                  {selectedEvent.is_sponsored ? 'Sponsored' : 'Event'}
                </Badge>
                <h2 className="text-2xl font-bold leading-tight mb-1">{selectedEvent.title}</h2>
                <div className="flex items-center gap-2 text-white/80 text-sm">
                    <Calendar className="w-4 h-4" /> {new Date(selectedEvent.start_date).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Social Proof */}
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border">
                 <div className="flex items-center -space-x-2">
                    {(selectedEvent.friend_images && selectedEvent.friend_images.length > 0) ? (
                      selectedEvent.friend_images.slice(0, 3).map((img: string, i: number) => (
                        <Avatar key={i} className="border-2 border-background w-8 h-8">
                          <AvatarImage src={img} />
                          <AvatarFallback className="text-[10px] bg-primary/10">👤</AvatarFallback>
                        </Avatar>
                      ))
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    {(selectedEvent.attendee_count || 0) > 3 && (
                       <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                         +{(selectedEvent.attendee_count || 0) - 3}
                       </div>
                    )}
                 </div>
                 <p className="text-xs text-muted-foreground">
                    {selectedEvent.friend_images?.length 
                      ? <span className="font-semibold text-primary">{selectedEvent.friend_images.length} {selectedEvent.friend_images.length === 1 ? 'friend is' : 'friends are'} going</span>
                      : <span>{selectedEvent.attendee_count || 0} {(selectedEvent.attendee_count || 0) === 1 ? 'person is' : 'people are'} going</span>
                    }
                 </p>
              </div>
              
              <Button variant="outline" className="w-full gap-2 border-dashed border-primary/40 text-primary h-12" onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}>
                <MessageCircle className="w-5 h-5" /> Join Vibe Check Chat
              </Button>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/30 p-3 rounded-xl">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">Time</p>
                  <p className="font-semibold">{new Date(selectedEvent.start_date).toLocaleTimeString([], {timeStyle: 'short'})}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">Price</p>
                  <p className="font-semibold">{selectedEvent.ticket_price ? `₦${selectedEvent.ticket_price.toLocaleString()}` : 'Free'}</p>
                </div>
                <div className="col-span-2 bg-muted/30 p-3 rounded-xl">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">Location</p>
                  <p className="font-semibold flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {selectedEvent.location}</p>
                </div>
              </div>

              {selectedEvent.description && (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {selectedEvent.description}
                </div>
              )}

              {selectedEvent.recurrence_rule && (
                <div className="flex items-center gap-3 p-3 border border-blue-100 bg-blue-50/50 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Repeat className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-900">Weekly Series</p>
                    <p className="text-xs text-blue-700">Get auto-invited to future events</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0">Subscribe</Button>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t bg-background sticky bottom-0 z-10 grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => addToCalendar(selectedEvent)}>
                  <Calendar className="w-4 h-4 mr-2" /> Calendar
              </Button>
              <Button 
                onClick={() => handleRSVP(selectedEvent.id)} 
                className={`h-12 rounded-xl ${selectedEvent.is_attending ? "bg-green-600 hover:bg-green-700" : "bg-primary hover:bg-primary/90"}`}
              >
                {selectedEvent.is_attending ? <><Check className="w-4 h-4 mr-2"/> Going</> : selectedEvent.ticket_price && selectedEvent.ticket_price > 0 ? <><Ticket className="w-4 h-4 mr-2"/> ₦{selectedEvent.ticket_price.toLocaleString()}</> : <><Ticket className="w-4 h-4 mr-2"/> RSVP</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* COMMUNITY DETAIL MODAL */}
      {selectedCommunity && (
        <Dialog open={!!selectedCommunity} onOpenChange={() => setSelectedCommunity(null)}>
          <DialogContent className="p-0 overflow-hidden sm:max-w-[420px] border-0">
            <div className="relative h-40 w-full bg-gradient-to-br from-primary/20 to-accent/20">
              {selectedCommunity.avatar_url && (
                <img src={selectedCommunity.avatar_url} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold leading-tight">{selectedCommunity.name}</h2>
                  {selectedCommunity.is_premium && (
                    <Badge className="bg-amber-500 text-white border-0 text-[10px]">Exclusive</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <Users className="w-4 h-4" /> {selectedCommunity.member_count || 0} members
                </div>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              {selectedCommunity.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedCommunity.description}</p>
              )}
              
              <div className="bg-muted/30 p-4 rounded-xl border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Access</span>
                  <span className="font-semibold">{selectedCommunity.is_premium ? 'Paid (Exclusive)' : 'Free to Join'}</span>
                </div>
                {selectedCommunity.is_premium && selectedCommunity.join_fee && selectedCommunity.join_fee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Membership Fee</span>
                    <span className="font-bold text-primary">₦{selectedCommunity.join_fee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-semibold">{selectedCommunity.member_count || 0}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 border-t bg-background">
              <Button 
                className="w-full h-12 rounded-xl"
                onClick={() => {
                  setSelectedCommunity(null);
                  navigate(`/app/messages?type=community&id=${selectedCommunity.id}`);
                }}
              >
                {selectedCommunity.is_premium && selectedCommunity.join_fee && selectedCommunity.join_fee > 0
                  ? <><Ticket className="w-4 h-4 mr-2" /> Join for ₦{selectedCommunity.join_fee.toLocaleString()}</>
                  : <><Users className="w-4 h-4 mr-2" /> Join Community</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <FriendProfilePreview profile={previewProfile} open={!!previewProfile} onClose={() => setPreviewProfile(null)} />
    </div>
  );
};

export default Feed;
