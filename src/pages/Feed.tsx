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
  Clock, Check, Repeat, ArrowRight, Music, 
  Martini, Palette, Zap, Lock, Bell, Globe, UserPlus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isToday, isFuture, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { LaunchGuard } from '@/components/guards/LaunchGuard';

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

// --- HELPERS ---
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
  const queryClient = useQueryClient();
  const { location } = useGeolocation();
  const { unreadCount } = useRealtimeNotifications(user?.id);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // Realtime & Subscriptions
  useEffect(() => {
    if (!user) return;
    const checkPremium = async () => {
      const [{ data: subData }, { data: featureData }] = await Promise.all([
        supabase.from('subscriptions').select('status').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
        supabase.from('premium_features').select('feature_type').eq('user_id', user.id).eq('is_active', true).gt('expires_at', new Date().toISOString()).limit(1)
      ]);
      setIsPremium(!!subData || (featureData && featureData.length > 0));
    };
    checkPremium();

    const channel = supabase.channel('feed-updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
      queryClient.invalidateQueries({ queryKey: ['smart-feed'] });
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  // Social Proof for Modal
  useEffect(() => {
    if (!selectedEvent?.id || !user) return;
    const fetchFriendsGoing = async () => {
      try {
        const { data: friendships } = await supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq('status', 'accepted');
        const friendIds = friendships?.map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id) || [];
        if (friendIds.length === 0) return;
        const { data: attendees } = await supabase.from('event_attendees').select('user_id').eq('event_id', selectedEvent.id).eq('status', 'confirmed').in('user_id', friendIds);
        if (!attendees || attendees.length === 0) return;
        const { data: profiles } = await supabase.from('profiles').select('user_id, avatar_url').in('user_id', attendees.map(a => a.user_id)).limit(5);
        if (profiles) setSelectedEvent(prev => prev?.id === selectedEvent.id ? { ...prev, friend_images: profiles.map(p => p.avatar_url).filter(Boolean) } : prev);
      } catch (err) { console.error(err); }
    };
    fetchFriendsGoing();
  }, [selectedEvent?.id, user?.id]);

  const handleRSVP = async (eventId: string) => {
    if (!user) return toast.error("Sign in to RSVP");
    const targetEvent = events.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) return;
    
    const newStatus = !targetEvent.is_attending;
    queryClient.setQueryData<any>(FEED_QUERY_KEY, (prev: any) => ({
      ...prev,
      events: prev.events.map((e: any) => e.id === eventId ? { ...e, is_attending: newStatus, attendee_count: (e.attendee_count || 0) + (newStatus ? 1 : -1) } : e)
    }));

    try {
      if (newStatus) {
        await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        toast.success("You're going! 🎉");
        if (targetEvent.ticket_price && (window as any).FlutterwaveCheckout) {
          (window as any).FlutterwaveCheckout({
            public_key: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY,
            tx_ref: `event-${eventId}-${Date.now()}`,
            amount: targetEvent.ticket_price,
            currency: "NGN",
            customer: { email: user.email },
            callback: () => toast.success("Payment confirmed!"),
          });
        }
        navigate(`/app/messages?type=event&id=${eventId}`);
      } else {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        toast.success("RSVP Cancelled");
      }
    } catch (e) { toast.error("Action failed"); queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY }); }
  };

  const displayEvents = useMemo(() => {
    let filtered = events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    if (activeTab === 'trending') return filtered.filter(e => (e.attendee_count || 0) > 10 || (e.match_score || 0) > 80);
    if (['music', 'nightlife', 'tech', 'sports', 'food', 'art'].includes(activeTab)) {
      return filtered.filter(e => e.category?.toLowerCase().includes(activeTab) || e.description?.toLowerCase().includes(activeTab));
    }
    return filtered;
  }, [events, searchQuery, activeTab]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <LaunchGuard>
        {({ isLocked, isGlobal, milestone, cityName }) => (
          <>
            {/* 1. HEADER */}
            <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    Discover <span className="text-primary truncate max-w-[150px]">{cityName}</span>
                  </h1>
                  <p className="text-xs text-muted-foreground">Find your vibe for today</p>
                </div>
                <div className="flex items-center gap-2">
                  {isPremium && <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pro</Badge>}
                  <Button size="icon" variant="ghost" className="rounded-full relative" onClick={() => navigate('/app/notifications')}>
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{unreadCount}</span>}
                  </Button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search vibes..." className="pl-9 bg-muted/50 border-0 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-x-auto scrollbar-hide">
                <TabsList className="bg-transparent h-auto gap-2 p-0 flex justify-start">
                  {['for_you', 'trending', 'communities', 'music', 'nightlife', 'tech', 'sports', 'food', 'art'].map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="rounded-full border px-4 py-2 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-white">
                      {tab.replace('_', ' ')}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* 2. CONTENT AREA */}
            <div className="container-mobile py-4 space-y-6">
              <TabsContent value={activeTab} className="mt-0 outline-none">
                {/* CASE A: City Locked (Launch Zone) */}
                {activeTab === 'for_you' && isLocked && !isGlobal && (
                  <div className="mx-4 mb-8 p-6 bg-card rounded-3xl border shadow-xl animate-in zoom-in-95 duration-300">
                    <Lock className="w-8 h-8 text-primary animate-pulse mb-4" />
                    <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">{cityName} IS LOADING...</h2>
                    <p className="text-sm text-muted-foreground mb-6">Join {milestone.current} pioneers. We unlock at {milestone.target}!</p>
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-[10px] font-black uppercase">
                        <span>Progress</span>
                        <span className="text-primary">{milestone.current} / {milestone.target}</span>
                      </div>
                      <div className="h-3 w-full bg-muted rounded-full overflow-hidden border">
                        <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${(milestone.current / milestone.target) * 100}%` }} />
                      </div>
                    </div>
                    <Button className="w-full h-12 rounded-2xl font-bold bg-primary text-white uppercase tracking-widest shadow-lg shadow-primary/20">
                      Invite to speed up
                    </Button>
                  </div>
                )}

                {/* CASE B: City Unavailable (Global Mode) */}
                {activeTab === 'for_you' && isGlobal && (
                  <div className="mx-4 mb-8 p-8 bg-muted/20 rounded-3xl border-2 border-dashed border-muted-foreground/20 text-center">
                    <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h2 className="text-xl font-bold">Coming Soon to {cityName}</h2>
                    <p className="text-sm text-muted-foreground mb-6">We haven't landed here yet. Help us prioritize your area!</p>
                    <Button className="w-full h-12 rounded-2xl font-bold bg-foreground text-background" onClick={() => navigate('/app/feed?tab=communities')}>
                      <UserPlus className="w-4 h-4 mr-2" /> Invite Friends
                    </Button>
                  </div>
                )}

                {/* 3. EVENT/COMMUNITY CARDS (Blurred if Locked) */}
                <div className={activeTab === 'for_you' && isLocked ? "opacity-30 grayscale blur-[6px] pointer-events-none select-none transition-all duration-700" : "transition-all duration-700"}>
                  {activeTab === 'communities' ? (
                    <div className="space-y-3 px-4">
                      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div> :
                        communities.length === 0 ? <div className="text-center py-10 opacity-50">No communities yet</div> :
                        communities.map(c => (
                          <Card key={c.id} className="p-4 flex items-center gap-4 cursor-pointer hover:bg-accent/50" onClick={() => setSelectedCommunity(c)}>
                            <Avatar className="h-14 w-14 rounded-xl border"><AvatarImage src={c.avatar_url || ''} /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                            <div className="flex-1">
                              <h4 className="font-bold flex items-center gap-2">{c.name} {c.is_premium && <Badge className="bg-amber-500 text-[9px]">Exclusive</Badge>}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                              <div className="flex items-center gap-1 mt-1 text-xs text-primary font-bold"><Users className="w-3 h-3" /> {c.member_count} members</div>
                            </div>
                            <ArrowRight className="text-muted-foreground w-5 h-5" />
                          </Card>
                        ))
                      }
                    </div>
                  ) : (
                    <div className="space-y-4 px-4">
                      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div> :
                        displayEvents.length === 0 ? <div className="text-center py-16 opacity-50"><Calendar className="mx-auto mb-4" /> No vibes found</div> :
                        displayEvents.map(event => {
                          const status = getEventStatus(event.start_date);
                          return (
                            <Card key={event.id} className="overflow-hidden shadow-sm group active:scale-[0.98] transition-transform" onClick={() => setSelectedEvent(event)}>
                              <div className="relative h-48 w-full bg-muted">
                                <img src={event.image_url || '/placeholder.jpg'} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <Badge className={`absolute top-3 left-3 ${status.color} border-0 shadow-sm`}>{status.label}</Badge>
                                <div className="absolute top-3 right-3 bg-white/95 text-black px-2 py-1 rounded-lg text-center shadow-md min-w-[45px]">
                                  <span className="block text-[10px] font-bold text-red-500 uppercase">{new Date(event.start_date).toLocaleString('default', { month: 'short' })}</span>
                                  <span className="block text-lg font-black leading-none">{new Date(event.start_date).getDate()}</span>
                                </div>
                              </div>
                              <CardContent className="p-4">
                                <h3 className="font-bold text-lg leading-tight mb-2 line-clamp-1">{event.title}</h3>
                                <div className="flex items-center text-xs text-muted-foreground gap-3">
                                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location || "TBD"}</span>
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(event.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                  <div className="flex items-center -space-x-2">
                                    {(event.friend_images || []).map((img, i) => (
                                      <Avatar key={i} className="w-7 h-7 border-2 border-background"><AvatarImage src={img} /></Avatar>
                                    ))}
                                    <span className="text-[10px] text-muted-foreground pl-3">{event.attendee_count || 0} attending</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={(e) => { e.stopPropagation(); navigate(`/app/messages?type=event&id=${event.id}`); }}>
                                      <MessageCircle className="w-4 h-4 text-primary" />
                                    </Button>
                                    <Button size="sm" className={`h-8 rounded-full px-4 ${event.is_attending ? "bg-green-600" : ""}`} onClick={(e) => { e.stopPropagation(); handleRSVP(event.id); }}>
                                      {event.is_attending ? "Going" : event.ticket_price ? `₦${event.ticket_price.toLocaleString()}` : "RSVP"}
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      }
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </>
        )}
      </LaunchGuard>

      {/* 3. MODALS */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="p-0 overflow-hidden max-w-[420px] border-0">
            <div className="relative h-64 w-full">
              <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5 text-white">
                <h2 className="text-2xl font-bold mb-1">{selectedEvent.title}</h2>
                <p className="flex items-center gap-2 text-white/80 text-sm"><MapPin className="w-4 h-4" /> {selectedEvent.location}</p>
              </div>
            </div>
            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border">
                 <div className="flex items-center -space-x-2">
                    {selectedEvent.friend_images?.slice(0, 3).map((img, i) => (
                      <Avatar key={i} className="border-2 border-background w-8 h-8"><AvatarImage src={img} /></Avatar>
                    ))}
                    {(selectedEvent.attendee_count || 0) > 3 && <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px]">+{selectedEvent.attendee_count! - 3}</div>}
                 </div>
                 <p className="text-xs font-bold text-primary">{selectedEvent.attendee_count} going</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{selectedEvent.description}</p>
            </div>
            <DialogFooter className="p-4 border-t grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => addToCalendar(selectedEvent)}>Calendar</Button>
              <Button onClick={() => handleRSVP(selectedEvent.id)} className={`h-12 rounded-xl ${selectedEvent.is_attending ? "bg-green-600" : "bg-primary"}`}>
                {selectedEvent.is_attending ? "Going" : "RSVP"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selectedCommunity && (
        <Dialog open={!!selectedCommunity} onOpenChange={() => setSelectedCommunity(null)}>
          <DialogContent className="p-0 overflow-hidden max-w-[420px] border-0">
            <div className="relative h-40 w-full bg-primary/10">
              {selectedCommunity.avatar_url && <img src={selectedCommunity.avatar_url} className="w-full h-full object-cover" />}
              <div className="absolute bottom-0 left-0 p-5 text-white bg-gradient-to-t from-black/80 w-full">
                <h2 className="text-xl font-bold">{selectedCommunity.name}</h2>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-4">{selectedCommunity.description}</p>
              <Button className="w-full h-12 rounded-xl" onClick={() => navigate(`/app/messages?type=community&id=${selectedCommunity.id}`)}>Join Community</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <FriendProfilePreview profile={previewProfile} open={!!previewProfile} onClose={() => setPreviewProfile(null)} />
    </div>
  );
};

export default Feed;
