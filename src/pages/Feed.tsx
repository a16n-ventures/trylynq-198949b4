import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, MapPin, Calendar, Users, Plus, 
  MessageCircle, Loader2, Sparkles, Ticket, 
  Clock, Check, Megaphone, SlidersHorizontal, Repeat,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';

// --- TYPES (Streamlined) ---
interface Event { 
  id: string; 
  title: string;
  start_date: string;
  end_date?: string;
  location: string | null; 
  image_url?: string; 
  match_score?: number;
  description?: string;
  price?: number;
  attendee_count?: number;
  is_attending?: boolean;
  is_sponsored?: boolean;
  recurrence_rule?: string;
  friend_images?: string[]; // The Facepile Data
}

interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
  cover_url?: string | null;
  is_member?: boolean;
  my_role?: string | null;
  match_score?: number; 
}

// --- HELPER: Calendar Sync (Phase 3: Do) ---
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
  
  // Data State
  const [events, setEvents] = useState<Event[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationName, setLocationName] = useState("Detecting...");
  
  // UI State
  const [activeTab, setActiveTab] = useState("discover");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!user) return;
    fetchSmartFeed();
    checkPremium();
  }, [user]);

  const checkPremium = async () => {
    const { data } = await supabase.from('subscriptions').select('status').eq('user_id', user?.id).eq('status', 'active').maybeSingle();
    setIsPremium(!!data);
  };

  // --- FETCHING (The Clyx Engine) ---
  const fetchSmartFeed = async () => {
    setLoading(true);
    try {
      // 1. Get Location (Crucial for "Discover")
      let userLat, userLong, city;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => 
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          userLat = pos.coords.latitude;
          userLong = pos.coords.longitude;
          
          // Reverse Geocode for Header
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLong}`);
          const data = await res.json();
          city = data.address.city || data.address.town || data.address.state;
          setLocationName(city || "Unknown Location");
        } catch (e) {
          console.warn("Location failed", e);
          setLocationName("Global Mode");
        }
      }

      // 2. Call the Intelligent Backend
      const { data: response, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { user_id: user?.id, user_lat: userLat, user_long: userLong, city }
      });

      if (error) throw error;

      if (response) {
        // Events (The Core)
        if (response.events) {
          setEvents(response.events.map((e: any) => ({
            ...e,
            attendee_count: e.attendee_count || 0,
            is_attending: false, // In real app, sync this with DB
            // The backend 'index.ts' now sends friend_images (Facepile data)
            friend_images: e.friend_images || [] 
          })));
        }
        
        // Communities (Interest Groups)
        if (response.communities) {
          setCommunities(response.communities.map((c: any) => ({
            ...c,
            avatar_url: c.cover_url || c.avatar_url || null
          })));
        }

        setAiInsights(response.ai_insights || null);
      }
    } catch (err) {
      console.error("Feed Error:", err);
      toast.error("Could not load discovery feed");
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    try {
      const event = events.find(e => e.id === eventId);
      if (event?.is_attending) {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        toast.success("RSVP Cancelled");
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_attending: false, attendee_count: (e.attendee_count || 1) - 1 } : e));
      } else {
        await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        toast.success("You're going! 🎉");
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 } : e));
        
        // AUTO-OPEN CHAT (Clyx "Decide" Flow)
        navigate(`/app/messages?type=event&id=${eventId}`);
      }
    } catch (e) {
      toast.error("Action failed");
    }
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-background pb-20">
      
      {/* 1. HEADER (Location & Search) */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Discover <span className="text-primary">{locationName}</span>
            </h1>
            <p className="text-xs text-muted-foreground">Find your vibe for today</p>
          </div>
          {isPremium && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              <Sparkles className="w-3 h-3 mr-1" /> Premium
            </Badge>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search events, vibes, people..." 
            className="pl-9 bg-muted/50 border-0 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      <div className="container-mobile py-4 space-y-6">
        
        {/* A. PREMIUM AI INSIGHT (The "Hype Man") */}
        {isPremium && aiInsights && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4 flex gap-3 shadow-sm">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-amber-900">Vibe Check</h3>
              <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">{aiInsights}</p>
            </div>
          </div>
        )}

        {/* B. CATEGORY TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-transparent p-0 justify-start gap-2 overflow-x-auto scrollbar-hide">
            <TabsTrigger value="discover" className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-white">For You</TabsTrigger>
            <TabsTrigger value="communities" className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-white">Communities</TabsTrigger>
            <TabsTrigger value="today" className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-white">Today</TabsTrigger>
          </TabsList>

          {/* C. DISCOVER FEED (Events First) */}
          <TabsContent value="discover" className="space-y-5 mt-4">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">Nothing happening nearby. Be the first to create a plan!</div>
            ) : (
              events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase())).map((event) => {
                const status = getEventStatus(event.start_date);
                
                return (
                  <Card key={event.id} className="overflow-hidden border-0 shadow-md group cursor-pointer" onClick={() => setSelectedEvent(event)}>
                    {/* Visual Cover */}
                    <div className="relative h-48 w-full bg-muted">
                      <img src={event.image_url || '/placeholder-event.jpg'} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      
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

                      {/* Date Badge */}
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-black px-2.5 py-1.5 rounded-lg text-center shadow-sm min-w-[50px]">
                        <span className="block text-xs font-bold uppercase text-red-500">{new Date(event.start_date).toLocaleString('default', { month: 'short' })}</span>
                        <span className="block text-lg font-black leading-none">{new Date(event.start_date).getDate()}</span>
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-lg leading-tight mb-1">{event.title}</h3>
                          <div className="flex items-center text-xs text-muted-foreground gap-3">
                            <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {event.location || "TBD"}</span>
                            <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {new Date(event.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        </div>
                      </div>

                      {/* THE "DECIDE" PHASE: Facepile + Social Proof */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center -space-x-2">
                          {(event.friend_images || []).slice(0, 3).map((img, i) => (
                            <Avatar key={i} className="w-7 h-7 border-2 border-background">
                              <AvatarImage src={img} />
                              <AvatarFallback>?</AvatarFallback>
                            </Avatar>
                          ))}
                          <div className="text-xs text-muted-foreground pl-3">
                            {event.friend_images?.length ? 
                              <span className="font-semibold text-foreground">{event.friend_images.length} friends</span> : 
                              <span>{event.attendee_count} attending</span>
                            }
                          </div>
                        </div>

                        {/* THE "DO" PHASE: Instant Action */}
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="h-8 w-8 rounded-full p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/app/messages?type=event&id=${event.id}`);
                            }}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            className={`h-8 rounded-full px-4 ${event.is_attending ? "bg-green-600 hover:bg-green-700" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRSVP(event.id);
                            }}
                          >
                            {event.is_attending ? "Going" : "RSVP"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* D. COMMUNITIES FEED */}
          <TabsContent value="communities" className="space-y-3 mt-4">
            {communities.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border shadow-sm cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/app/messages?type=community&id=${c.id}`)}>
                <Avatar className="h-14 w-14 rounded-xl border">
                  <AvatarImage src={c.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback>{c.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold truncate">{c.name}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                    <Users className="w-3 h-3" /> {c.member_count} members
                  </div>
                </div>
                <Button size="icon" variant="ghost"><ArrowRight className="w-5 h-5 text-muted-foreground" /></Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* 3. EVENT DETAIL MODAL (Enhanced) */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="p-0 overflow-hidden sm:max-w-[420px]">
            <div className="relative h-56 w-full">
              <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-4 left-4 text-white">
                <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md mb-2">
                  {selectedEvent.is_sponsored ? 'Sponsored Event' : 'Public Event'}
                </Badge>
                <h2 className="text-2xl font-bold leading-none">{selectedEvent.title}</h2>
              </div>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Vibe Check Action */}
              <Button variant="outline" className="w-full gap-2 border-dashed border-primary/40 text-primary" onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}>
                <MessageCircle className="w-4 h-4" /> Join Vibe Check Chat
              </Button>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Date</p>
                  <p className="font-semibold mt-0.5">{new Date(selectedEvent.start_date).toDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Time</p>
                  <p className="font-semibold mt-0.5">{new Date(selectedEvent.start_date).toLocaleTimeString([], {timeStyle: 'short'})}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Location</p>
                  <p className="font-semibold mt-0.5 flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {selectedEvent.location}</p>
                </div>
              </div>

              {/* Description */}
              {selectedEvent.description && (
                <div className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg">
                  {selectedEvent.description}
                </div>
              )}

              {/* Recurrence */}
              {selectedEvent.recurrence_rule && (
                <div className="flex items-center gap-3 p-3 border border-blue-100 bg-blue-50/50 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Repeat className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-blue-900">Weekly Series</p>
                    <p className="text-[10px] text-blue-700">Get auto-invited to future events</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600">Subscribe</Button>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t bg-muted/10 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => addToCalendar(selectedEvent)}><Calendar className="w-4 h-4 mr-2" /> Calendar</Button>
              <Button 
                onClick={() => handleRSVP(selectedEvent.id)} 
                className={selectedEvent.is_attending ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {selectedEvent.is_attending ? <><Check className="w-4 h-4 mr-2"/> Going</> : <><Ticket className="w-4 h-4 mr-2"/> RSVP</>}
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
