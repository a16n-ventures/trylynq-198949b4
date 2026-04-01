import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from '@tanstack/react-query';
import { 
  Search, MapPin, Calendar, Users, Plus, 
  MessageCircle, Loader2, Sparkles, Ticket, 
  Clock, Check, Megaphone, Repeat,
  ArrowRight, Music, Martini, Palette, Zap, Rocket, UserPlus, Globe, Lock, Bell
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useLaunchZone } from '@/hooks/useLaunchZone';

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

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useRealtimeNotifications(user?.id);
  
  // Data State
  const [events, setEvents] = useState<Event[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const { isInLaunchZone, isLoading: launchZoneLoading } = useLaunchZone(location?.latitude, location?.longitude);
  
  // UI State
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [milestone, setMilestone] = useState<{ current: number; target: number; is_unlocked: boolean; zone_name?: string } | null>(null);

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-prefs', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('preferences').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user) return;
    fetchSmartFeed();
    checkPremium();
  }, [user, location?.latitude, location?.longitude]);

  useEffect(() => {
    if (!selectedEvent?.id || !user) return;
    const fetchFriendsGoing = async () => {
      try {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const friendIds = friendships?.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id) || [];
        if (friendIds.length === 0) return;

        const { data: attendees } = await supabase
          .from('event_attendees')
          .select('user_id')
          .eq('event_id', selectedEvent.id)
          .eq('status', 'confirmed')
          .in('user_id', friendIds);

        if (!attendees || attendees.length === 0) return;
        const attendeeIds = attendees.map(a => a.user_id);

        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, avatar_url')
          .in('user_id', attendeeIds)
          .limit(5);

        if (profiles && profiles.length > 0) {
          const avatars = profiles.map(p => p.avatar_url).filter(Boolean);
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

  const fetchSmartFeed = async () => {
    setLoading(true);
    try {
      let currentLat = location?.latitude;
      let currentLong = location?.longitude;
      let city = 'Detecting...';

      if (currentLat && currentLong) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLat}&lon=${currentLong}`);
          const data = await res.json();
          city = data.address.city || data.address.town || data.address.state || "Nearby";
          setLocationName(city);
        } catch (e) {
          console.warn("Reverse geocoding failed", e);
          setLocationName("Global Mode");
        }
      }

      const { data: response, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { user_id: user?.id, user_lat: currentLat, user_long: currentLong, city: city }
      });

      if (error) throw error;

      if (response) {
        setMilestone(response.milestone || null);
        const { data: myAttendance } = await supabase
          .from('event_attendees')
          .select('event_id')
          .eq('user_id', user?.id || '');
        const attendingIds = new Set(myAttendance?.map(a => a.event_id) || []);

        if (response.events) {
          setEvents(response.events.map((e: any) => ({
            ...e,
            attendee_count: e.attendee_count || 0,
            is_attending: attendingIds.has(e.id),
            friend_images: e.friend_images || []
          })));
        }
        
        if (response.communities) {
          const seen = new Set<string>();
          const unique = response.communities.filter((c: any) => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });
          setCommunities(unique.map((c: any) => ({
            ...c,
            avatar_url: c.cover_url || c.avatar_url || null,
            is_premium: c.is_premium || false,
            join_fee: c.join_fee || 0,
          })));
        }
      }
    } catch (err) {
      console.error("Feed Error:", err);
      toast.error("Could not load discovery feed");
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return toast.error("Please sign in to RSVP");
    const targetEvent = events.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) return;
    
    const isCurrentlyAttending = targetEvent.is_attending;
    const newStatus = !isCurrentlyAttending;
    const modifier = newStatus ? 1 : -1;
  
    const updateState = (e: Event): Event => ({
      ...e,
      is_attending: newStatus,
      attendee_count: Math.max(0, (e.attendee_count || 0) + modifier)
    });
  
    setEvents(prev => prev.map(e => e.id === eventId ? updateState(e) : e));
    if (selectedEvent?.id === eventId) setSelectedEvent(prev => prev ? updateState(prev) : null);
  
    try {
      if (newStatus) {
        const { error } = await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        if (error) throw error;
        toast.success("You're going! 🎉");
        
        if (targetEvent.ticket_price && targetEvent.ticket_price > 0) {
          const flwKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
          if (flwKey && window.FlutterwaveCheckout) {
            window.FlutterwaveCheckout({
              public_key: flwKey,
              tx_ref: `event-${eventId}-${user.id}-${Date.now()}`,
              amount: targetEvent.ticket_price,
              currency: "NGN",
              customer: { email: user.email || "user@app.com", name: user.email || "User" },
              callback: async (res: any) => {
                await supabase.from('payments').insert({
                  user_id: user.id, amount: targetEvent.ticket_price!, status: 'success',
                  tx_ref: `event-${eventId}-${user.id}-${Date.now()}`,
                  flw_ref: res.flw_ref || res.transaction_id?.toString(),
                });
                toast.success("Payment confirmed!");
              }
            });
          }
        }
        navigate(`/app/messages?type=event&id=${eventId}`);
      } else {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        toast.success("RSVP Cancelled");
      }
    } catch (e: any) {
      setEvents(prev => prev.map(e => e.id === eventId ? targetEvent : e));
      toast.error(e.message || "Action failed");
    }
  };

  const getFilteredEvents = () => {
    let filtered = events;
    if (searchQuery) filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    switch (activeTab) {
        case 'trending': return filtered.filter(e => (e.attendee_count || 0) > 10 || (e.match_score && e.match_score > 80));
        case 'music': return filtered.filter(e => e.category?.toLowerCase().includes('music') || e.description?.toLowerCase().includes('music'));
        case 'nightlife': return filtered.filter(e => e.category?.toLowerCase().includes('nightlife') || e.category?.toLowerCase().includes('party'));
        case 'tech': return filtered.filter(e => e.category?.toLowerCase().includes('tech'));
        case 'sports': return filtered.filter(e => e.category?.toLowerCase().includes('sports'));
        case 'food': return filtered.filter(e => e.category?.toLowerCase().includes('food'));
        case 'art': return filtered.filter(e => e.category?.toLowerCase().includes('art'));
        default: return filtered;
    }
  };

  const displayEvents = getFilteredEvents();
  const showCityUnavailable = !locationLoading && !launchZoneLoading && isInLaunchZone === false;
  const cityNotDetected = !locationLoading && !launchZoneLoading && !location;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b pb-0">
        <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  Discover <span className="text-primary">{locationName}</span>
                </h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {locationName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isPremium && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 font-bold tracking-tight px-2 py-0.5 rounded-full"><Sparkles className="w-3 h-3 mr-1" /> PREMIUM</Badge>}
                <Button size="icon" variant="ghost" className="rounded-full relative" onClick={() => navigate('/app/notifications')}>
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </Button>
              </div>
            </div>
            <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search events, vibes, people..." className="pl-9 bg-muted/50 border-0 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="w-full overflow-x-auto scrollbar-hide px-4 pb-3">
                <TabsList className="bg-transparent p-0 gap-2 h-auto flex justify-start">
                    {['for_you', 'trending', 'communities', 'music', 'nightlife', 'tech', 'sports', 'food', 'art'].map(tab => (
                      <TabsTrigger key={tab} value={tab} className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all capitalize">
                        {tab.replace('_', ' ')}
                      </TabsTrigger>
                    ))}
                </TabsList>
            </div>

            {cityNotDetected ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center"><MapPin className="w-10 h-10 text-muted-foreground" /></div>
                <h2 className="text-xl font-bold italic uppercase tracking-tighter">Location Required</h2>
                <p className="text-sm text-muted-foreground max-w-xs">Please enable location access to discover events in {locationName}.</p>
                <Button variant="outline" className="rounded-2xl px-8" onClick={() => window.location.reload()}>Retry Detection</Button>
              </div>
            ) : !milestone?.is_unlocked ? (
              <div className="space-y-6">
                <div className="mx-4 mt-4 p-8 bg-card rounded-[2.5rem] border border-dashed border-primary/30 shadow-xl relative overflow-hidden bg-gradient-to-br from-background to-primary/5">
                  <div className="relative z-10 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2"><Lock className="w-8 h-8 text-primary/60" /></div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                      {milestone?.zone_name || locationName} IS LOADING...
                    </h2>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground font-medium">Ahmia goes live once <span className="text-foreground font-bold">{milestone?.target || 500} Pioneers</span> join.</p>
                      <p className="text-[11px] text-muted-foreground/60 italic leading-none">Social features are currently in "Stealth Mode."</p>
                    </div>
                    <div className="flex justify-between items-end px-1 pt-4">
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground leading-tight">{milestone?.zone_name || "DETECTING..."}</p>
                        <p className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground leading-tight">Pioneers</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary">{milestone?.current || 0} / {milestone?.target || 500}</p>
                      </div>
                    </div>
                    <div className="h-4 w-full bg-muted rounded-full overflow-hidden border p-[3px]">
                      <div className="h-full bg-gradient-to-r from-[#6366f1] to-[#a855f7] rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${Math.min(100, ((milestone?.current || 0) / (milestone?.target || 500)) * 100)}%` }} />
                    </div>
                    <Button className="w-full h-14 rounded-2xl font-bold uppercase gap-2 shadow-lg bg-gradient-to-r from-[#6366f1] to-[#a855f7] border-0 mt-4 text-white" onClick={() => navigate('/app/friends')}>
                      <UserPlus className="w-5 h-5" /> Invite Friends to Speed Up
                    </Button>
                  </div>
                </div>
                <div className="px-4 opacity-30 grayscale blur-lg pointer-events-none select-none overflow-hidden h-[40vh]">
                   <h3 className="font-bold mb-4 italic uppercase">Happening soon in {locationName}...</h3>
                   <div className="space-y-4">
                     {displayEvents.length > 0 ? displayEvents.slice(0, 2).map((event) => (
                       <Card key={event.id} className="overflow-hidden border-0 shadow-sm rounded-3xl"><div className="h-32 bg-muted w-full" /><CardContent className="p-4 h-20 bg-card" /></Card>
                     )) : [1, 2].map((i) => <div key={i} className="h-48 bg-muted rounded-[2.5rem] mb-4 animate-pulse" />)}
                   </div>
                </div>
              </div>
            ) : showCityUnavailable ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"><Globe className="w-10 h-10 text-primary" /></div>
                <h2 className="text-xl font-bold uppercase italic tracking-tighter">Coming Soon</h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Ahmia hasn't landed in {locationName} yet, but we're expanding fast!</p>
                <Button className="gap-2 rounded-2xl px-8" variant="outline" onClick={() => navigate('/app/friends')}><Megaphone className="w-4 h-4" /> Nominate {locationName}</Button>
              </div>
            ) : (
              <div className="container-mobile py-2 space-y-6">
                <TabsContent value={activeTab} className="mt-0 space-y-5 px-4 min-h-[50vh]">
                  {activeTab === 'communities' ? (
                    <div className="space-y-3">
                      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : 
                      communities.length === 0 ? <div className="text-center py-16 flex flex-col items-center gap-4"><div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground/40" /></div><div><p className="font-semibold">No communities yet in {locationName}</p></div></div> :
                      communities.map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border shadow-sm cursor-pointer hover:bg-accent/50" onClick={() => setSelectedCommunity(c)}>
                          <Avatar className="h-14 w-14 rounded-xl border"><AvatarImage src={c.avatar_url || undefined} className="object-cover" /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2"><h4 className="font-bold truncate">{c.name}</h4>{cis_premium && <Badge className="bg-amber-500 text-white border-0 text-[10px]">Exclusive</Badge>}</div>
                            <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary"><Users className="w-3 h-3" /> {c.member_count} members</div>
                          </div>
                          <Button size="icon" variant="ghost"><ArrowRight className="w-5 h-5 text-muted-foreground" /></Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : 
                      displayEvents.length === 0 ? <div className="text-center py-16 flex flex-col items-center gap-4"><div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center"><Calendar className="w-10 h-10 text-muted-foreground/30" /></div><div><p className="font-semibold text-base">No events for this vibe yet in {locationName}</p></div><Button className="rounded-full px-6 gap-2 shadow-md" onClick={() => navigate('/app/events/create')}><Plus className="w-4 h-4" /> Create Event</Button></div> :
                      displayEvents.map((event) => {
                        const status = getEventStatus(event.start_date);
                        return (
                        <Card key={event.id} className="overflow-hidden border-0 shadow-md group cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setSelectedEvent(event)}>
                          <div className="relative h-48 w-full bg-muted">
                            <img src={event.image_url || '/placeholder-event.jpg'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute top-3 left-3 flex gap-2">
                              <Badge className={`${status.color} text-white border-0 shadow-sm backdrop-blur-md`}>{status.label}</Badge>
                              {event.match_score && event.match_score > 80 && <Badge className="bg-black/60 text-white border-0 backdrop-blur-md"><Sparkles className="w-3 h-3 mr-1 text-yellow-400" /> {event.match_score}% Match</Badge>}
                            </div>
                            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-black px-2.5 py-1.5 rounded-lg text-center shadow-sm min-w-[50px]">
                              <span className="block text-xs font-bold uppercase text-red-500">{new Date(event.start_date).toLocaleString('default', { month: 'short' })}</span>
                              <span className="block text-lg font-black leading-none">{new Date(event.start_date).getDate()}</span>
                            </div>
                          </div>
                          <CardContent className="p-4">
                            <h3 className="font-bold text-lg leading-tight mb-1 line-clamp-2">{event.title}</h3>
                            <div className="flex items-center text-xs text-muted-foreground gap-3">
                              <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {event.location || locationName}</span>
                              <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {new Date(event.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex items-center -space-x-2">
                                {(event.friend_images || []).slice(0, 3).map((img, i) => <Avatar key={i} className="w-7 h-7 border-2 border-background"><AvatarImage src={img} /><AvatarFallback>?</AvatarFallback></Avatar>)}
                                <div className="text-xs text-muted-foreground pl-3 font-medium">
                                  {event.friend_images?.length ? <span className="text-foreground">{event.friend_images.length} {event.friend_images.length === 1 ? 'friend' : 'friends'} going</span> : <span>{event.attendee_count || 0} attending</span>}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="secondary" className="h-8 w-8 rounded-full p-0" onClick={(e) => { e.stopPropagation(); navigate(`/app/messages?type=event&id=${event.id}`); }}><MessageCircle className="w-4 h-4 text-primary" /></Button>
                                <Button size="sm" className={`h-8 rounded-full px-4 ${event.is_attending ? "bg-green-600" : ""}`} onClick={(e) => { e.stopPropagation(); handleRSVP(event.id); }}>{event.is_attending ? "Going" : event.ticket_price ? `₦${event.ticket_price.toLocaleString()}` : "RSVP"}</Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </>
                  )}
                </TabsContent>
              </div>
            )}
        </Tabs>
      </div>

      {/* EVENT MODAL */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="p-0 overflow-hidden sm:max-w-[420px] border-0">
            <div className="relative h-64 w-full">
              <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-white rounded-full" onClick={() => setSelectedEvent(null)}><ArrowRight className="w-6 h-6 rotate-180" /></Button>
              <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                <Badge className="bg-white/20 mb-2 border-0 backdrop-blur-md italic font-bold">EVENT</Badge>
                <h2 className="text-2xl font-black leading-tight mb-1 italic uppercase tracking-tighter">{selectedEvent.title}</h2>
                <div className="flex items-center gap-2 text-white/80 text-sm font-medium"><Calendar className="w-4 h-4" /> {new Date(selectedEvent.start_date).toLocaleDateString()} in {locationName}</div>
              </div>
            </div>
            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border">
                 <div className="flex items-center -space-x-2">
                    {selectedEvent.friend_images?.slice(0, 3).map((img, i) => <Avatar key={i} className="border-2 border-background w-8 h-8"><AvatarImage src={img} /><AvatarFallback>👤</AvatarFallback></Avatar>)}
                    {(selectedEvent.attendee_count || 0) > 3 && <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold">+{(selectedEvent.attendee_count || 0) - 3}</div>}
                 </div>
                 <p className="text-xs text-muted-foreground font-medium">{selectedEvent.friend_images?.length ? <span className="font-bold text-primary">{selectedEvent.friend_images.length} friends are going</span> : <span>{selectedEvent.attendee_count || 0} attending</span>}</p>
              </div>
              <Button variant="outline" className="w-full gap-2 border-dashed border-primary/40 text-primary h-12 rounded-2xl font-bold uppercase" onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}><MessageCircle className="w-5 h-5" /> Join Vibe Check Chat</Button>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/30 p-3 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Time</p><p className="font-black italic">{new Date(selectedEvent.start_date).toLocaleTimeString([], {timeStyle: 'short'})}</p></div>
                <div className="bg-muted/30 p-3 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Price</p><p className="font-black italic">{selectedEvent.ticket_price ? `₦${selectedEvent.ticket_price.toLocaleString()}` : 'Free'}</p></div>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed italic">{selectedEvent.description}</div>
            </div>
            <DialogFooter className="p-4 border-t sticky bottom-0 bg-background grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-xl font-bold" onClick={() => addToCalendar(selectedEvent)}><Calendar className="w-4 h-4 mr-2" /> Calendar</Button>
              <Button onClick={() => handleRSVP(selectedEvent.id)} className={`h-12 rounded-xl font-bold uppercase ${selectedEvent.is_attending ? "bg-green-600" : "bg-primary"}`}>{selectedEvent.is_attending ? "Going" : "RSVP Now"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* COMMUNITY MODAL */}
      {selectedCommunity && (
        <Dialog open={!!selectedCommunity} onOpenChange={() => setSelectedCommunity(null)}>
          <DialogContent className="p-0 overflow-hidden sm:max-w-[420px] border-0">
            <div className="relative h-40 w-full bg-primary/10">
              {selectedCommunity.avatar_url && <img src={selectedCommunity.avatar_url} className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5 text-white w-full"><h2 className="text-xl font-black italic uppercase tracking-tighter">{selectedCommunity.name}</h2></div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed italic">{selectedCommunity.description}</p>
              <div className="bg-muted/30 p-4 rounded-xl border flex justify-between items-center"><span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Members</span><span className="font-black italic">{selectedCommunity.member_count || 0}</span></div>
            </div>
            <DialogFooter className="p-4 border-t"><Button className="w-full h-12 rounded-xl font-bold uppercase" onClick={() => { setSelectedCommunity(null); navigate(`/app/messages?type=community&id=${selectedCommunity.id}`); }}>Join Community</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <FriendProfilePreview profile={previewProfile} open={!!previewProfile} onClose={() => setPreviewProfile(null)} />
    </div>
  );
};

export default Feed;
