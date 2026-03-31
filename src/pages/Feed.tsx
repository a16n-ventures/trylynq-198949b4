import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from '@tanstack/react-query';
import { 
  Search, MapPin, Calendar, Users, 
  MessageCircle, Loader2, Sparkles, 
  Clock, Lock, Bell, Globe, UserPlus, ArrowRight
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
  }, [user]);

  const handleRSVP = async (eventId: string, currentEvents: Event[]) => {
    if (!user) return toast.error("Sign in to RSVP");
    const targetEvent = currentEvents.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) return;
    
    const newStatus = !targetEvent.is_attending;

    try {
      if (newStatus) {
        await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        toast.success("You're going! 🎉");
        navigate(`/app/messages?type=event&id=${eventId}`);
      } else {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        toast.success("RSVP Cancelled");
      }
      queryClient.invalidateQueries({ queryKey: ['smart-feed'] });
    } catch (e) { toast.error("Action failed"); }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <LaunchGuard>
        {({ isLocked, isGlobal, milestone, cityName, events, communities, loading }) => {
          // Logic now inside a proper function body
          const displayEvents = events.filter(e => {
            const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase());
            if (activeTab === 'trending') return matchesSearch && ((e.attendee_count || 0) > 10 || (e.match_score || 0) > 80);
            if (['music', 'nightlife', 'tech', 'sports', 'food', 'art'].includes(activeTab)) {
              return matchesSearch && (e.category?.toLowerCase().includes(activeTab) || e.description?.toLowerCase().includes(activeTab));
            }
            return matchesSearch;
          });

          return (
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
                  {activeTab === 'for_you' && isLocked && !isGlobal && (
                    <div className="mx-4 mb-8 p-6 bg-card rounded-3xl border shadow-xl">
                      <Lock className="w-8 h-8 text-primary animate-pulse mb-4" />
                      <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">{cityName} IS LOADING...</h2>
                      <p className="text-sm text-muted-foreground mb-6 font-medium">Join {milestone.current} pioneers. We unlock at {milestone.target}!</p>
                      <div className="h-3 w-full bg-muted rounded-full overflow-hidden border mb-6">
                        <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${(milestone.current / milestone.target) * 100}%` }} />
                      </div>
                      <Button className="w-full h-12 rounded-2xl font-bold uppercase bg-primary text-white">Invite to speed up</Button>
                    </div>
                  )}

                  {activeTab === 'for_you' && isGlobal && (
                    <div className="mx-4 mb-8 p-8 bg-muted/20 rounded-3xl border-2 border-dashed border-muted-foreground/20 text-center">
                      <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                      <h2 className="text-xl font-bold text-foreground">Coming Soon to {cityName}</h2>
                      <p className="text-sm text-muted-foreground mb-6 font-medium">We're launching here next! Spread the word.</p>
                      <Button className="w-full h-12 rounded-2xl font-bold bg-foreground text-background">Invite Friends</Button>
                    </div>
                  )}

                  <div className={activeTab === 'for_you' && isLocked ? "opacity-30 grayscale blur-[6px] pointer-events-none" : ""}>
                    {activeTab === 'communities' ? (
                      <div className="space-y-3 px-4">
                        {communities.map(c => (
                          <Card key={c.id} className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedCommunity(c)}>
                            <Avatar className="h-14 w-14 rounded-xl border"><AvatarImage src={c.avatar_url || ''} /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                            <div className="flex-1">
                              <h4 className="font-bold">{c.name}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-muted-foreground" />
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4 px-4">
                        {displayEvents.map(event => {
                          const status = getEventStatus(event.start_date);
                          return (
                            <Card key={event.id} className="overflow-hidden shadow-sm" onClick={() => setSelectedEvent(event)}>
                              <div className="relative h-48 w-full bg-muted">
                                <img src={event.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
                                <Badge className={`absolute top-3 left-3 ${status.color}`}>{status.label}</Badge>
                              </div>
                              <CardContent className="p-4">
                                <h3 className="font-bold text-lg leading-tight mb-2">{event.title}</h3>
                                <div className="flex items-center text-xs text-muted-foreground gap-3">
                                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location || "TBD"}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                  <div className="flex items-center -space-x-2">
                                    {(event.friend_images || []).map((img, i) => (
                                      <Avatar key={i} className="w-7 h-7 border-2 border-background"><AvatarImage src={img} /></Avatar>
                                    ))}
                                    <span className="text-[10px] text-muted-foreground pl-3">{event.attendee_count || 0} attending</span>
                                  </div>
                                  <Button size="sm" className={`h-8 rounded-full px-4 ${event.is_attending ? "bg-green-600" : ""}`} onClick={(e) => { e.stopPropagation(); handleRSVP(event.id, events); }}>
                                    {event.is_attending ? "Going" : "RSVP"}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </div>
            </>
          );
        }}
      </LaunchGuard>

      {/* MODALS RENDER OUTSIDE GUARD */}
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
            <div className="p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">{selectedEvent.description}</p>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => addToCalendar(selectedEvent)}>Calendar</Button>
                <Button className="flex-1 h-12 rounded-xl" onClick={() => handleRSVP(selectedEvent.id, [])}>RSVP</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <FriendProfilePreview profile={previewProfile} open={!!previewProfile} onClose={() => setPreviewProfile(null)} />
    </div>
  );
};

export default Feed;
