import { useState, useEffect, useMemo, useRef } from 'react';
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
  MessageCircle, Loader2, Sparkles, Bell, ArrowRight, Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isToday, isFuture, addHours, differenceInMinutes } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';

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
  category?: string;
  friend_images?: string[]; 
}

interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
}

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useRealtimeNotifications(user?.id);
  
  // 1. LOCATION & LAUNCH DATA
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const launchData = useLaunchZone(location?.latitude, location?.longitude);
  
  // 2. DATA STATE
  const [events, setEvents] = useState<Event[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (location?.latitude && location?.longitude) {
      fetchSmartFeed();
      checkPremium();
    }
  }, [location?.latitude, location?.longitude]);

  const checkPremium = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    setIsPremium(!!data);
  };

  const fetchSmartFeed = async () => {
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { 
            user_id: user?.id, 
            user_lat: location?.latitude, 
            user_long: location?.longitude 
        }
      });

      if (error) throw error;
      if (response) {
        setEvents(response.events || []);
        setCommunities(response.communities || []);
        setLocationName(response.milestone?.zone_name || "Nearby");
      }
    } catch (err) {
      console.error("Feed Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 3. FLW PAYMENT & RSVP LOGIC
  const handleRSVP = async (eventId: string) => {
    if (!user) return toast.error("Please sign in to RSVP");
    const targetEvent = events.find(e => e.id === eventId) || selectedEvent;
    if (!targetEvent) return;
    
    const isCurrentlyAttending = targetEvent.is_attending;
    const newStatus = !isCurrentlyAttending;

    try {
      if (newStatus) {
        // Handle Ticket Payment via Flutterwave
        if (targetEvent.ticket_price && targetEvent.ticket_price > 0) {
          const flwKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
          if (flwKey && (window as any).FlutterwaveCheckout) {
            (window as any).FlutterwaveCheckout({
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
                // Finalize RSVP after successful payment
                await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
                toast.success("Paid & Registered! 🎉");
                fetchSmartFeed(); // Refresh UI
              }
            });
            return; // Exit and wait for FLW callback
          }
        }

        // Free Event RSVP
        const { error } = await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        if (error) throw error;
        toast.success("You're going! 🎉");
      } else {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        toast.success("RSVP Cancelled");
      }
      fetchSmartFeed();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    }
  };

  return (
    <LaunchZoneGuard {...launchData} locationDetected={!!location}>
      <div className="min-h-screen bg-background pb-24">
        {/* HEADER */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-xl font-bold italic uppercase tracking-tighter">
                  Discover <span className="text-primary">{locationName}</span>
                </h1>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {locationName} LOCAL VIBES
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isPremium && <Badge className="bg-amber-500 text-white font-bold tracking-tighter">PREMIUM</Badge>}
                <Button size="icon" variant="ghost" className="relative rounded-full" onClick={() => navigate('/app/notifications')}>
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">{unreadCount}</span>}
                </Button>
              </div>
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Find events, communities, vibes..." className="pl-9 bg-muted/50 border-0 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
        </div>

        {/* TABS LIST */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="w-full overflow-x-auto scrollbar-hide px-4 py-3">
            <TabsList className="bg-transparent p-0 gap-2 h-auto flex justify-start">
              {['for_you', 'trending', 'communities', 'music', 'nightlife', 'tech'].map(tab => (
                <TabsTrigger key={tab} value={tab} className="rounded-full border px-4 py-2 text-xs font-black data-[state=active]:bg-primary data-[state=active]:text-white uppercase italic tracking-tight">
                  {tab.replace('_', ' ')}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="container-mobile px-4 space-y-6">
            <TabsContent value={activeTab} className="mt-0 space-y-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Gathering Vibes...</p>
                </div>
              ) : (
                events.map(event => (
                  <Card key={event.id} className="overflow-hidden border-0 shadow-xl group cursor-pointer" onClick={() => setSelectedEvent(event)}>
                    <div className="relative h-52">
                      <img src={event.image_url || '/placeholder.jpg'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute top-3 left-3 flex gap-2">
                         <Badge className="bg-primary/90 backdrop-blur-md text-white border-0">UPCOMING</Badge>
                         {event.match_score && event.match_score > 80 && (
                            <Badge className="bg-black/60 text-white backdrop-blur-md border-0">
                                <Sparkles className="w-3 h-3 mr-1 text-yellow-400" /> {event.match_score}% MATCH
                            </Badge>
                         )}
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-black text-xl italic uppercase tracking-tighter leading-tight">{event.title}</h3>
                      <div className="flex items-center text-[11px] text-muted-foreground gap-3 mt-2 font-bold uppercase">
                        <span className="flex items-center"><MapPin className="w-3 h-3 mr-1 text-primary" /> {event.location}</span>
                        <span className="flex items-center"><Clock className="w-3 h-3 mr-1 text-primary" /> {new Date(event.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center -space-x-2">
                            {event.friend_images?.slice(0, 3).map((img, i) => (
                                <Avatar key={i} className="w-7 h-7 border-2 border-background">
                                    <AvatarImage src={img} /><AvatarFallback>?</AvatarFallback>
                                </Avatar>
                            ))}
                            <span className="text-[10px] font-bold text-muted-foreground ml-3 uppercase">
                                {event.attendee_count || 0} attending
                            </span>
                        </div>
                        <Button 
                            size="sm" 
                            className={`h-9 rounded-xl px-4 font-black italic uppercase tracking-tighter ${event.is_attending ? "bg-green-600" : "bg-primary"}`}
                            onClick={(e) => { e.stopPropagation(); handleRSVP(event.id); }}
                        >
                            {event.is_attending ? "Going" : event.ticket_price ? `₦${event.ticket_price.toLocaleString()}` : "RSVP"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </div>
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
    </LaunchZoneGuard>
  );
};

export default Feed;
