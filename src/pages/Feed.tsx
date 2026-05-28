import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Clock, Check, Megaphone, Repeat, Video, Heart,
  ArrowRight, Music, Martini, Palette, Zap, Rocket, UserPlus, Globe, Lock, Bell, ShieldCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isPast, isFuture, isToday, addHours, differenceInMinutes, formatDistanceToNow } from "date-fns";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';

// --- TYPES (local — avoids collision with DOM Event) ---
type FeedEvent = {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  image_url?: string | null;
  category?: string | null;
  creator_id?: string | null;
  ticket_price?: number | null;
  match_score?: number;
  raw_score?: number;
  attendee_count?: number;
  is_attending?: boolean;
  is_sponsored?: boolean;
  is_verified?: boolean;
  is_official?: boolean | null;
  friend_images?: string[];
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  event_type?: 'physical' | 'virtual' | null;
  meeting_link?: string | null;
  recurrence_rule?: string | null;
  requires_approval?: boolean | null;
  max_attendees?: number | null;
};

type FeedCommunity = {
  id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  avatar_url?: string | null;
  member_count?: number;
  is_premium?: boolean;
  join_fee?: number;
  is_member?: boolean;
};

// --- HELPER: Calendar Sync ---
const addToCalendar = (event: FeedEvent) => {
  const start = new Date(event.start_date).toISOString().replace(/-|:|\.\d\d\d/g, "");
  const end = event.end_date 
    ? new Date(event.end_date).toISOString().replace(/-|:|\.\d\d\d/g, "") 
    : new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, "");

  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${start}/${end}&details=${encodeURIComponent(event.description || "")}&location=${encodeURIComponent(event.location || "")}`;
  window.open(googleUrl, '_blank');
  toast.success("Opening Calendar...");
};

const getEventStatus = (startDate: string, endDate?: string | null) => {
  const start = new Date(startDate);
  const now = new Date();
  
  // Use the specified end_date; if missing, fall back to a 3-hour duration window
  const end = endDate ? new Date(endDate) : addHours(start, 3);

  // 1. Bounded status checks: Active window vs past window
  if (now >= start && now <= end) {
    return { label: 'Happening Now', color: 'bg-green-600' };
  }
  
  if (now > end) {
    return { label: 'Past', color: 'bg-muted' };
  }

  // 2. Future status checks
  if (isToday(start)) {
    return { label: 'Today', color: 'bg-blue-500' };
  }

  if (isFuture(start)) {
    const hoursUntil = differenceInMinutes(start, now) / 60;
    if (hoursUntil <= 24) return { label: 'Soon', color: 'bg-amber-500' };
    return { label: 'Upcoming', color: 'bg-primary' };
  }
  
  return { label: 'Past', color: 'bg-muted' };
};

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatTicketPrice = (price: number | null | undefined) => {
  if (!price || price === 0) return 'Free';
  return `₦${price.toLocaleString()}`;
};

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useRealtimeNotifications(user?.id);
  
  // Data State
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [communities, setCommunities] = useState<FeedCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const { location, isLoading: locationLoading } = useGeolocation();
  
  const { isInLaunchZone, isWithinCity, isLoading: launchZoneLoading, currentCount, targetCount, cityName, parentCity } =
    useLaunchZone(location?.latitude, location?.longitude);
  
  // UI State
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<FeedEvent | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<FeedCommunity | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('feed_favorites') || '[]')); }
    catch { return new Set(); }
  });

  const toggleFavorite = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) { next.delete(eventId); toast('Removed from favorites'); }
      else { next.add(eventId); toast.success('Added to favorites ❤️'); }
      localStorage.setItem('feed_favorites', JSON.stringify([...next]));
      return next;
    });
  };
  const [isPremium, setIsPremium] = useState(false);

  // Pioneer milestone derived from launch zone hook
  const milestone = useMemo(() => ({
    current: currentCount,
    target: targetCount,
    is_unlocked: isInLaunchZone ?? false,
    zone_name: cityName || undefined,
  }), [currentCount, targetCount, isInLaunchZone, cityName]);

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-prefs', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('preferences').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Stabilize location to prevent flickering on every GPS update
  const lastFetchedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const hasFetchedRef = useRef(false);

  // Isolated geocoding properly closed to solve the compiler crash
  const geocodeLocation = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return;
      await res.json();
    } catch (e) {
      console.error("Geocode suppression capture:", e);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const lat = location?.latitude;
    const lng = location?.longitude;
    const prev = lastFetchedLocationRef.current;

    // Skip re-fetch if location barely moved (< 0.5km)
    if (prev && lat && lng) {
      const dLat = Math.abs(lat - prev.lat);
      const dLng = Math.abs(lng - prev.lng);
      if (dLat < 0.005 && dLng < 0.005 && hasFetchedRef.current) return;
    }

    if (lat && lng) {
      lastFetchedLocationRef.current = { lat, lng };
      geocodeLocation(lat, lng);
    }
    hasFetchedRef.current = true;

    fetchSmartFeed();
    checkPremium();
  }, [user, location?.latitude, location?.longitude]);

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('feed-attendees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees' }, () => {
        fetchSmartFeed();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

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
    if (!user?.id) return;  // guard #1
    setLoading(true);
    try {
      const currentLat = location?.latitude ?? null;
      const currentLong = location?.longitude ?? null;
      const city = cityName || null;  // fix #1 — never pass 'Nearby'
  
      const { data: rawResponse, error } = await supabase.rpc('generate_smart_feed', {
        p_user_id: user.id,
        p_user_lat: currentLat,
        p_user_long: currentLong,
        p_city: city,
      });
  
      if (error) throw error;
  
      const response = rawResponse as { events?: any[]; communities?: any[]; milestone?: any } | null;
      if (!response) return;
  
      if (response.events) {
        const creatorIds = Array.from(
          new Set(response.events.map((e: any) => e.creator_id).filter(Boolean))
        ) as string[];
  
        const { data: creatorProfiles } = creatorIds.length > 0
          ? await supabase
              .from('profiles')
              .select('user_id, verification_status')
              .in('user_id', creatorIds)
          : { data: [] as Array<{ user_id: string; verification_status: string | null }> };
  
        const verifiedCreators = new Set(
          creatorProfiles?.filter(p => p.verification_status === 'verified').map(p => p.user_id) || []
        );
  
        setEvents(response.events.map((e: any) => ({
          ...e,
          is_attending: e.is_attending ?? false,  // use RPC value directly
          attendee_count: e.attendee_count || 0,
          friend_images: Array.isArray(e.friend_images) ? e.friend_images.filter(Boolean) : [],
          distanceKm: currentLat && currentLong && e.latitude && e.longitude
            ? Number(calculateDistanceKm(currentLat, currentLong, Number(e.latitude), Number(e.longitude)).toFixed(1))
            : null,
          is_verified: verifiedCreators.has(e.creator_id),
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
          member_count: c.member_count || 0,  // trust RPC count; no extra query needed
        })));
      }
    } catch (err: any) {
      console.error("Feed Error:", err);
      toast.error(err?.message || "Could not load discovery feed");
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
  
    const updateState = (e: FeedEvent): FeedEvent => ({
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
    let filtered = [...events];
  
    // 1. Apply global filters
    if (verifiedOnly) {
      filtered = filtered.filter(e => e.creator_id && e.is_verified); 
    }
  
    if (searchQuery) {
      filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    // 2. Filter down by active tab category
    switch (activeTab) {
      case 'trending': 
        filtered = filtered.filter(e => (e.attendee_count || 0) > 10 || (e.match_score && e.match_score > 80)); 
        break;
      case 'music': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('music') || e.description?.toLowerCase().includes('music')); 
        break;
      case 'nightlife': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('nightlife') || e.category?.toLowerCase().includes('party')); 
        break;
      case 'tech': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('tech')); 
        break;
      case 'sports': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('sports')); 
        break;
      case 'food': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('food')); 
        break;
      case 'art': 
        filtered = filtered.filter(e => e.category?.toLowerCase().includes('art')); 
        break;
      default: 
        break;
    }
  
    // 3. Apply sorting logic
    if (activeTab === 'for_you') {
      filtered.sort((a, b) => {
        // 🌟 IMPROVEMENT: Prioritize sponsored events in the layout
        if (a.is_sponsored && !b.is_sponsored) return -1;
        if (!a.is_sponsored && b.is_sponsored) return 1;
    
        const da = a.distanceKm ?? 9999;
        const db = b.distanceKm ?? 9999;
        if (Math.abs(da - db) > 0.5) return da - db;
        const scoreA = (a.match_score || 0) + (a.friend_images?.length || 0) * 10;
        const scoreB = (b.match_score || 0) + (b.friend_images?.length || 0) * 10;
        return scoreB - scoreA;
      });
    } else {
      // Sort all other categories by sponsored status first, then by chronological order
      filtered.sort((a, b) => {
        if (a.is_sponsored && !b.is_sponsored) return -1;
        if (!a.is_sponsored && b.is_sponsored) return 1;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      });
    }
  
    return filtered;
  };

  const displayEvents = getFilteredEvents();
  const currentCityDisplay = cityName || "Nearby";

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={isWithinCity}
      isInLaunchZone={isInLaunchZone}
      cityName={cityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0}
    >
      <div className="min-h-screen bg-background pb-24">
        {/* HEADER */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b pb-0">
          <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    Discover <span className="text-primary">{launchZoneLoading ? "Detecting..." : currentCityDisplay}</span>
                  </h1> 
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {parentCity || "Detecting..."}
                  </p>
                </div>
                <div className="flex items-center gap-2"> 
                  <Button 
                    variant={verifiedOnly ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setVerifiedOnly(!verifiedOnly)}
                    className={`rounded-full h-9 px-3 gap-2 transition-all ${verifiedOnly ? 'bg-primary text-white' : 'text-muted-foreground'}`}
                  >
                    <ShieldCheck className={`w-4 h-4 ${verifiedOnly ? 'fill-white/20' : ''}`} />
                    <span className="text-xs font-bold">Vouched</span>
                  </Button>
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

              <div className="container-mobile py-2 space-y-6">
                <TabsContent value={activeTab} className="mt-0 space-y-5 px-4 min-h-[50vh]">
                  {activeTab === 'communities' ? (
                    <div className="space-y-3">
                      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : 
                      communities.length === 0 ? <div className="text-center py-16 flex flex-col items-center gap-4"><div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground/40" /></div><div><p className="font-semibold">No communities yet in {milestone?.zone_name}</p></div><Button className="rounded-full px-6 gap-2 shadow-md" onClick={() => navigate('/app/messages')}><Plus className="w-4 h-4" /> Create Community</Button></div> :
                      communities.map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border shadow-sm cursor-pointer hover:bg-accent/50" onClick={() => setSelectedCommunity(c)}>
                          <Avatar className="h-14 w-14 rounded-xl border"><AvatarImage src={c.avatar_url || undefined} className="object-cover" /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2"><h4 className="font-bold truncate">{c.name}</h4>{c.is_premium && <Badge className="bg-amber-500 text-white border-0 text-[10px]">Exclusive</Badge>}</div>
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
                      displayEvents.length === 0 ? <div className="text-center py-16 flex flex-col items-center gap-4"><div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center"><Calendar className="w-10 h-10 text-muted-foreground/30" /></div><div><p className="font-semibold text-base">No events for this vibe yet in {milestone?.zone_name}</p></div><Button className="rounded-full px-6 gap-2 shadow-md" onClick={() => navigate('/create-event')}><Plus className="w-4 h-4" /> Create Event</Button></div> :
                      displayEvents.map((event) => {
                        const status = getEventStatus(event.start_date, event.end_date);
                                                return (
                          <Card 
                            key={event.id} 
                            className={`overflow-hidden border transition-all duration-300 group cursor-pointer active:scale-[0.98] ${
                              event.is_sponsored 
                                ? 'border-amber-500/40 shadow-md shadow-amber-500/5 bg-gradient-to-b from-transparent to-amber-500/[0.02]' 
                                : 'border-transparent shadow-md'
                            }`} 
                            onClick={() => setSelectedEvent(event)}
                          >
                            <div className="relative h-48 w-full bg-muted">
                              <img src={event.image_url || '/placeholder-event.jpg'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                              
                              {/* Dynamic Ribbon Badges on Upper Left */}
                              <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap items-center">
                                {event.is_sponsored && (
                                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold tracking-wide border-0 shadow-sm uppercase text-[9px] px-2 py-0.5 flex items-center gap-1 animate-pulse">
                                    <Sparkles className="w-2.5 h-2.5 fill-current" />
                                  </Badge>
                                )}
                                <Badge className={`${status.color} text-white border-0 shadow-sm backdrop-blur-md text-[10px]`}>
                                  {status.label}
                                </Badge> 
                                {event.recurrence_rule && (
                                  <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                                    <Repeat className="w-3 h-3 mr-1" /> {event.recurrence_rule.replace('FREQ=', '').charAt(0).toUpperCase() + event.recurrence_rule.replace('FREQ=', '').slice(1).toLowerCase()}
                                  </Badge>
                                )}
                                {event.match_score && event.match_score > 80 && (
                                  <Badge className="bg-black/60 text-white border-0 backdrop-blur-md text-[10px]">
                                    <Zap className="w-2.5 h-2.5 mr-0.5 text-yellow-400 fill-yellow-400" /> {event.match_score}% Vibe
                                  </Badge>
                                )}
                              </div>
                        
                              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                                <button
                                  onClick={(e) => toggleFavorite(event.id, e)}
                                  className="w-9 h-9 rounded-full flex items-center justify-center shadow-md backdrop-blur-md transition-all active:scale-90"
                                  style={{ background: favorites.has(event.id) ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.85)' }}
                                >
                                  <Heart className={`w-4 h-4 transition-all ${favorites.has(event.id) ? 'fill-white text-white' : 'text-gray-500'}`} />
                                </button>
                              </div>
                        
                              {/* Metadata Bottom Tags row overlay */}
                              <div className="absolute bottom-3 left-3 right-3 text-white">
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/90">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-md font-medium">
                                    <Ticket className="w-3 h-3" /> {formatTicketPrice(event.ticket_price)}
                                  </span>
                                  {event.distanceKm != null && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-md font-medium">
                                      <MapPin className="w-3 h-3" /> {event.distanceKm}km
                                    </span>
                                  )}
                                  {event.is_verified && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-md font-medium text-cyan-300">
                                      <ShieldCheck className="w-3 h-3 fill-cyan-400/20" /> Vouched
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                        
                            <CardContent className="p-3">
                              <h3 className="font-bold text-sm leading-snug line-clamp-1 mb-1 group-hover:text-primary transition-colors">
                                {event.title}
                              </h3>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
                                <span className="flex items-center gap-0.5 font-medium"><Calendar className="w-3 h-3 text-primary/70" /> {new Date(event.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                <span className="text-border">·</span>
                                <span className="flex items-center gap-0.5 truncate max-w-[120px]"><MapPin className="w-3 h-3 shrink-0 text-primary/70" /> <span className="truncate">{event.event_type === 'virtual' ? 'Online' : (event.location || currentCityDisplay)}</span></span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-0.5"><Users className="w-3 h-3 text-primary/70" /> {event.attendee_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} going</span>
                                <span className="text-border">·</span>
                                <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(event.start_date), { addSuffix: true })}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </>
                  )}
                </TabsContent>
              </div>
          </Tabs>
        </div>

        {/* EVENT MODAL */}
        {selectedEvent && (
          <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
            <DialogContent className="p-0 overflow-hidden sm:max-w-[420px] border-0 max-h-[85vh] flex flex-col">
              <div className="relative h-48 w-full shrink-0">
                <img src={selectedEvent.image_url || '/placeholder.jpg'} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-white rounded-full" onClick={() => setSelectedEvent(null)}><ArrowRight className="w-6 h-6 rotate-180" /></Button>
                <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                  {selectedEvent.is_official && (
                    <Badge className="bg-primary text-white border-0 backdrop-blur-md"><Megaphone className="w-3 h-3 mr-1" /> Official</Badge>
                  )}
                  {selectedEvent.event_type === 'virtual' && (
                    <Badge className="bg-cyan-600/80 text-white border-0 backdrop-blur-md"><Video className="w-3 h-3 mr-1" /> Virtual</Badge>
                  )}
                </div>
                                {/* Find line 348 inside your code file, update the header image layout stack: */}
                <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge className="bg-white/20 border-0 backdrop-blur-md italic font-bold text-[10px]">
                      EVENT
                    </Badge>
                    {selectedEvent.is_sponsored && (
                      <Badge className="bg-amber-500 text-white font-bold tracking-wide border-0 text-[10px] uppercase px-2 py-0.5 flex items-center gap-1 shadow-sm">
                        <Sparkles className="w-2.5 h-2.5 fill-current" />
                        Sponsored Vibe
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-2xl font-black leading-tight mb-1 italic uppercase tracking-tighter">
                    {selectedEvent.title}
                  </h2>
                  <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                    <Calendar className="w-4 h-4" /> {new Date(selectedEvent.start_date).toLocaleDateString()} in {milestone?.zone_name}
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border">
                   <div className="flex items-center -space-x-2">
                      {selectedEvent.friend_images?.slice(0, 3).map((img, i) => <Avatar key={i} className="border-2 border-background w-8 h-8"><AvatarImage src={img} /><AvatarFallback>👤</AvatarFallback></Avatar>)}
                      {(selectedEvent.attendee_count || 0) > 3 && <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold">+{(selectedEvent.attendee_count || 0) - 3}</div>}
                   </div>
                   <p className="text-xs text-muted-foreground font-medium">{selectedEvent.friend_images?.length ? <span className="font-bold text-primary">{selectedEvent.friend_images.length} friends are going</span> : <span>{selectedEvent.attendee_count || 0} attending</span>}</p>
                </div>
                <Button variant="outline" className="w-full gap-2 border-dashed border-primary/40 text-primary h-10 rounded-xl font-bold uppercase text-xs" onClick={() => navigate(`/app/messages?type=event&id=${selectedEvent.id}`)}><MessageCircle className="w-5 h-5" /> Join Vibe Check Chat</Button>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/30 p-2.5 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-0.5">Time</p><p className="font-black">{new Date(selectedEvent.start_date).toLocaleTimeString([], {timeStyle: 'short'})}</p></div>
                  <div className="bg-muted/30 p-2.5 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-0.5">Price</p><p className="font-black">{selectedEvent.ticket_price ? `₦${selectedEvent.ticket_price.toLocaleString()}` : 'Free'}</p></div>
                  <div className="bg-muted/30 p-2.5 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-0.5">Location</p><p className="font-black truncate">{selectedEvent.event_type === 'virtual' ? 'Online' : (selectedEvent.location || currentCityDisplay)}</p></div>
                  {selectedEvent.max_attendees && (
                    <div className="bg-muted/30 p-2.5 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-0.5">Capacity</p><p className="font-black">{selectedEvent.attendee_count || 0} / {selectedEvent.max_attendees}{(selectedEvent.attendee_count || 0) >= selectedEvent.max_attendees ? ' · Full' : ''}</p></div>
                  )}
                </div>
                {selectedEvent.requires_approval && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <Check className="w-4 h-4 shrink-0" /> Attendance requires host approval
                  </div>
                )}
                <div className="text-xs text-muted-foreground leading-relaxed italic line-clamp-3">{selectedEvent.description}</div>
              </div>
              <DialogFooter className="p-4 border-t sticky bottom-0 bg-background grid gap-3">
                {selectedEvent.event_type === 'virtual' && selectedEvent.meeting_link && (
                  <Button variant="outline" className="h-12 rounded-xl font-bold w-full" onClick={() => window.open(selectedEvent.meeting_link!, '_blank')}>
                    <Video className="w-4 h-4 mr-2" /> Join Online
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-12 rounded-xl font-bold" onClick={() => addToCalendar(selectedEvent)}><Calendar className="w-4 h-4" /> ADD TO CALENDAR </Button>
                  <Button
                    onClick={() => {
                      if (!selectedEvent.is_attending && selectedEvent.requires_approval) {
                        // Route to Messages event chat with request flag so host sees it as a join request
                        navigate(`/app/messages?type=event&id=${selectedEvent.id}&action=request`);
                        setSelectedEvent(null);
                      } else {
                        handleRSVP(selectedEvent.id);
                      }
                    }}
                    className={`h-12 rounded-xl font-bold uppercase ${selectedEvent.is_attending ? "bg-green-600" : "bg-primary"}`}
                  >
                    {selectedEvent.is_attending ? "Going" : selectedEvent.requires_approval ? "Request to Join" : "RSVP Now"}
                  </Button>
                </div>
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