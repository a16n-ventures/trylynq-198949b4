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
  ArrowRight, Music, Martini, Palette, Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { useGeolocation } from '@/contexts/LocationContext'; 

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
  
  // Data State
  const [events, setEvents] = useState<Event[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { location, isLoading: locationLoading, error: locationError } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  
  // UI State
  const [activeTab, setActiveTab] = useState("for_you"); // Default to Clyx "For You"
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!user) return;
    fetchSmartFeed();
    checkPremium();
  }, [user]);

  // --- FETCH FRIENDS FOR MODAL (NUCLEAR FIX) ---
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
        
        const friendIds = friendships?.map(f => 
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
  
        const attendeeIds = attendees.map(a => a.user_id);
  
        // 3. Fetch their profiles/avatars
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, avatar_url')
          .in('user_id', attendeeIds)
          .limit(5);
  
        if (profiles && profiles.length > 0) {
          const avatars = profiles.map(p => p.avatar_url).filter(Boolean);
          
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
    const { data } = await supabase.from('subscriptions').select('status').eq('user_id', user?.id).eq('status', 'active').maybeSingle();
    setIsPremium(!!data);
  };

  // --- FETCHING (The Clyx Engine) ---
  const fetchSmartFeed = async () => {
    setLoading(true);
    try {
      // 1. Get Location from Context (Single Source of Truth)
      let currentLat = location?.latitude;
      let currentLong = location?.longitude;
      let city = 'Detecting...';

      // If Context is ready, reverse geocode for the header name
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

      // 2. Call the Intelligent Backend
      const { data: response, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { 
          user_id: user?.id, 
          user_lat: currentLat, 
          user_long: currentLong, 
          city: city 
        }
      });

      if (error) throw error;

      if (response) {
        // Events (The Core)
        if (response.events) {
          setEvents(response.events.map((e: any) => ({
            ...e,
            attendee_count: e.attendee_count || 0,
            is_attending: false, 
            friend_images: e.friend_images || [] // Facepile Data
          })));
        }
        
        // Communities
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

  // --- NUCLEAR RSVP FIX ---
  const handleRSVP = async (eventId: string) => {
    if (!user) return toast.error("Please sign in to RSVP");
    
    // ✅ FIX: Find event from EITHER source
    const targetEvent = events.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) {
      console.error('Event not found:', eventId);
      toast.error("Event not found");
      return;
    }
    
    // 1. PAYMENT CHECK
    if (event?.ticket_price && event.ticket_price > 0 && !event.is_attending) {
       // Open your payment modal here
       // return; (Stop the function so it doesn't auto-confirm)
       toast.info(`Please pay ₦${event.ticket_price} to join!`); 
       return; 
    }
  
    const isCurrentlyAttending = targetEvent.is_attending;
    const newStatus = !isCurrentlyAttending;
    const modifier = newStatus ? 1 : -1;
  
    // Helper to update an event object
    const updateEventState = (e: Event): Event => ({
      ...e,
      is_attending: newStatus,
      attendee_count: Math.max(0, (e.attendee_count || 0) + modifier)
    });
  
    // Optimistic Update
    setEvents(prev => prev.map(e => e.id === eventId ? updateEventState(e) : e));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(prev => prev ? updateEventState(prev) : null);
    }
  
    try {
      if (newStatus) {
        // ✅ ADD ERROR LOGGING
        const { error } = await supabase
          .from('event_attendees')
          .insert({ 
            event_id: eventId, 
            user_id: user.id, 
            status: 'confirmed' 
          });
        
        if (error) {
          console.error('RSVP Insert Error:', error);
          throw error;
        }
        
        toast.success("You're going! 🎉");
        navigate(`/app/messages?type=event&id=${eventId}`);
      } else {
        const { error } = await supabase
          .from('event_attendees')
          .delete()
          .match({ event_id: eventId, user_id: user.id });
        
        if (error) {
          console.error('RSVP Delete Error:', error);
          throw error;
        }
        
        toast.success("RSVP Cancelled");
      }
    } catch (e: any) {
      console.error('RSVP Failed:', e);
      toast.error(e.message || "Action failed");
      
      // Revert on failure
      const revertEventState = (e: Event): Event => ({
        ...e,
        is_attending: isCurrentlyAttending,
        attendee_count: Math.max(0, (e.attendee_count || 0) - modifier)
      });
      
      setEvents(prev => prev.map(e => e.id === eventId ? revertEventState(e) : e));
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(prev => prev ? revertEventState(prev) : null);
      }
    }
  };

  // --- FILTER LOGIC (Simulating Clyx Categories) ---
  const getFilteredEvents = () => {
    let filtered = events;
    if (searchQuery) {
        filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    switch (activeTab) {
        case 'for_you': return filtered; // Algorithm default
        case 'trending': return filtered.filter(e => (e.attendee_count || 0) > 10 || e.match_score && e.match_score > 80);
        case 'music': return filtered.filter(e => e.category?.toLowerCase() === 'music' || e.description?.toLowerCase().includes('music'));
        case 'nightlife': return filtered.filter(e => e.category?.toLowerCase() === 'party' || e.title.toLowerCase().includes('party'));
        case 'art': return filtered.filter(e => e.category?.toLowerCase() === 'arts' || e.title.toLowerCase().includes('art'));
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
            {isPremium && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <Sparkles className="w-3 h-3 mr-1" /> Premium
                </Badge>
            )}
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

        {/* 2. CLYX CATEGORY TABS (Scrollable) */}
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
                    <TabsTrigger value="art" className="rounded-full border border-border px-4 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary transition-all">
                        <Palette className="w-3 h-3 mr-1.5" /> Art
                    </TabsTrigger>
                </TabsList>
            </div>

            {/* CONTENT AREA */}
            <div className="container-mobile py-2 space-y-6">
                
                {/* AI Insight (Visible on all tabs) */}
                {isPremium && aiInsights && activeTab === 'for_you' && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4 flex gap-3 shadow-sm mx-4 mt-2">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                        <h3 className="font-bold text-sm text-amber-900">Vibe Check</h3>
                        <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">{aiInsights}</p>
                        </div>
                    </div>
                )}

                {/* EVENTS FEED */}
                <TabsContent value={activeTab} className="mt-0 space-y-5 px-4 min-h-[50vh]">
                    {activeTab === 'communities' ? (
                        // COMMUNITIES VIEW
                        <div className="space-y-3">
                            {communities.map(c => (
                            <div key={c.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border shadow-sm cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/app/messages?type=community&id=${c.id}`)}>
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
                        </div>
                    ) : (
                        // EVENTS VIEW (Generic for all event tabs)
                        <>
                            {loading ? (
                                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : displayEvents.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                        <Calendar className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p>No events found for this vibe.</p>
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
                                                <span className="text-foreground">{event.friend_images.length} friends going</span> : 
                                                <span>{event.attendee_count} attending</span>
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
                                                {event.is_attending ? "Going" : "RSVP"}
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
              {/* 2.b THE FACEPILE (Social Proof) */}
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border">
                 <div className="flex items-center -space-x-3">
                    {/* Render Friend Faces if available, else generic placeholders */}
                    {(selectedEvent.friend_images && selectedEvent.friend_images.length > 0 ? selectedEvent.friend_images : [null, null, null]).slice(0, 3).map((img: string | null, i: number) => (
                       <Avatar key={i} className="border-2 border-background w-8 h-8">
                         <AvatarImage src={img || undefined} />
                         <AvatarFallback className="text-[10px] bg-muted-foreground/20">{img ? '' : '?'}</AvatarFallback>
                       </Avatar>
                    ))}
                    {selectedEvent.attendee_count && selectedEvent.attendee_count > 3 && (
                       <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                         +{selectedEvent.attendee_count - 3}
                       </div>
                    )}
                 </div>
                 <div className="text-xs text-muted-foreground">
                    {selectedEvent.friend_images?.length ? 
                      <span className="font-semibold text-primary">{selectedEvent.friend_images.length} friends going</span> : 
                      <span>{selectedEvent.attendee_count || 0} people going</span>
                    }
                 </div>
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
