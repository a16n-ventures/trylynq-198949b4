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
  MessageCircle, Loader2, Sparkles, Ticket, 
  Clock, Check, Megaphone, Repeat,
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
  friend_images?: string[];
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
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

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

import { formatTicketPrice } from '@/lib/eventFormat';

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useRealtimeNotifications(user?.id);
  
  // Data State
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [communities, setCommunities] = useState<FeedCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // --- NEW: Explorer UX State ---
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const [geocodedCity, setGeocodedCity] = useState<string | null>(null); 
  const { isInLaunchZone, isWithinCity, isLoading: launchZoneLoading, currentCount, targetCount, cityName: launchCityName }
  = useLaunchZone(location?.latitude, location?.longitude, geocodedCity);
  
  // UI State
  const [activeTab, setActiveTab] = useState("for_you");
  const [selectedEvent, setSelectedEvent] = useState<FeedEvent | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<FeedCommunity | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  // Pioneer milestone derived from launch zone hook
  const milestone = useMemo(() => ({
    current: currentCount,
    target: targetCount,
    is_unlocked: isInLaunchZone ?? false,
    zone_name: launchCityName || undefined,
  }), [currentCount, targetCount, isInLaunchZone, launchCityName]);

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

  useEffect(() => {
    if (!user) return;

    const lat = location?.latitude;
    const lng = location?.longitude;
    const prev = lastFetchedLocationRef.current;

    // Skip re-fetch if location barely moved (< 0.5km)
    if (prev && lat && lng) {
      const dLat = Math.abs(lat - prev.lat);
      const dLng = Math.abs(lng - prev.lng);
      // ~0.005 degrees ≈ 0.5km
      if (dLat < 0.005 && dLng < 0.005 && hasFetchedRef.current) return;
    }

    if (lat && lng) {
      lastFetchedLocationRef.current = { lat, lng };
    }
    hasFetchedRef.current = true;

    fetchSmartFeed();
    checkPremium();
  }, [user, location?.latitude, location?.longitude]);

  // Realtime: refresh feed when RSVPs change so attendee counts update live
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('feed-attendees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees' }, () => {
        fetchSmartFeed();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  if (!isInLaunchZone) return; // Wait for the guard to verify access  setLoading(true);
    try {
      const currentLat = location?.latitude;
      const currentLong = location?.longitude;
      let city = 'Detecting...';

      if (currentLat && currentLong) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLat}&lon=${currentLong}`);
          const data = await res.json();
          city = data.address.city || data.address.town || data.address.state || "Nearby";
          setLocationName(city);
        } catch (e) {
          console.warn("Reverse geocoding failed", e);
          setLocationName("Nearby");
        }
      }
      
      // Use the name already resolved by the Guard/useLaunchZone
      const cityQueryName = launchCityName || geocodedCity || "Nearby";

      const { data: rawResponse, error } = await supabase.rpc('generate_smart_feed', {
        p_user_id: user?.id,
        p_user_lat: currentLat,
        p_user_long: currentLong,
        p_city: cityQueryName, // Prioritize the DB-matched city name
      });

      if (error) throw error;

      const response = rawResponse as { events?: any[]; communities?: any[]; milestone?: any } | null;
      if (response) {
        const { data: myAttendance } = await supabase
          .from('event_attendees')
          .select('event_id')
          .eq('user_id', user?.id || '');
        const attendingIds = new Set(myAttendance?.map(a => a.event_id) || []);

        if (response.events) {
          // --- FIXED: Fetch creator verification status since the RPC doesn't return it ---
          const creatorIds = Array.from(new Set(response.events.map((e: any) => e.creator_id).filter(Boolean))) as string[];
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
            attendee_count: e.attendee_count || 0,
            is_attending: attendingIds.has(e.id),
            friend_images: e.friend_images || [],
            distanceKm: currentLat && currentLong && e.latitude && e.longitude
              ? Number(calculateDistanceKm(currentLat, currentLong, Number(e.latitude), Number(e.longitude)).toFixed(1))
              : null,
            // --- INJECT VERIFIED STATUS HERE ---
            is_verified: verifiedCreators.has(e.creator_id)
          })));
        }
        
        if (response.communities) {
          const seen = new Set<string>();
          const unique = response.communities.filter((c: any) => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });
          // Reconcile real member counts
          const ids = unique.map((c: any) => c.id);
          const { data: members } = ids.length
            ? await supabase.from('community_members').select('community_id').in('community_id', ids)
            : { data: [] as any[] };
          const realCount = new Map<string, number>();
          (members || []).forEach((m: any) => {
            realCount.set(m.community_id, (realCount.get(m.community_id) || 0) + 1);
          });
          setCommunities(unique.map((c: any) => ({
            ...c,
            avatar_url: c.cover_url || c.avatar_url || null,
            is_premium: c.is_premium || false,
            join_fee: c.join_fee || 0,
            member_count: realCount.get(c.id) ?? (c.member_count || 0),
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

  // --- MODIFIED: Smart Feed Logic for Explorers ---
  const getFilteredEvents = () => {
    let filtered = [...events];

    // 1. Trust Filter: Hide unvouched events if toggled
    if (verifiedOnly) {
      filtered = filtered.filter(e => e.creator_id && e.is_verified); 
      // Note: is_verified comes from the backend payload
    }

    if (searchQuery) {
      filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // 2. Prioritized View: Nearby first for 'for_you', then friends-going & match score
    if (activeTab === 'for_you') {
      filtered.sort((a, b) => {
        const da = a.distanceKm ?? 9999;
        const db = b.distanceKm ?? 9999;
        if (Math.abs(da - db) > 0.5) return da - db;
        const scoreA = (a.match_score || 0) + (a.friend_images?.length || 0) * 10;
        const scoreB = (b.match_score || 0) + (b.friend_images?.length || 0) * 10;
        return scoreB - scoreA;
      });
    }
    
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

  return (
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={isWithinCity}
      isInLaunchZone={isInLaunchZone}
      cityName={launchCityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0}
      onCityResolved{setGeocodedCity}
    >
      <div className="min-h-screen bg-background pb-24">
        {/* HEADER */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b pb-0">
          <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    Discover <span className="text-primary">{milestone?.zone_name}</span>
                  </h1>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> City: {locationName}
                  </p>
                </div>
                <div className="flex items-center gap-2"> 
                  {/* --- NEW: Trust Filter Toggle --- */}
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
                        const status = getEventStatus(event.start_date);
                        return (
                        <Card key={event.id} className="overflow-hidden border-0 shadow-md group cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setSelectedEvent(event)}>
                          <div className="relative h-48 w-full bg-muted">
                            <img src={event.image_url || '/placeholder-event.jpg'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                            <div className="absolute top-3 left-3 flex gap-2">
                                <Badge className={`${status.color} text-white border-0 shadow-sm backdrop-blur-md`}>{status.label}</Badge>
                                {/* --- Explorer UI: High Match Score Badge --- */}
                                {event.match_score && event.match_score > 80 && (
                                  <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                                    <Sparkles className="w-3 h-3 mr-1 text-yellow-400" /> {event.match_score}% Vibe Match
                                  </Badge>
                                )}
                              </div>
                              
                              {/* --- NEW: Vouch Badge for Verified Organizers --- */}
                              {event.is_verified && (
                                <div className="absolute top-3 right-16">
                                   <div className="bg-primary/90 text-white p-1.5 rounded-full shadow-lg backdrop-blur-md">
                                      <ShieldCheck className="w-4 h-4 fill-white/20" />
                                   </div>
                                </div>
                              )}

                              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-black px-2.5 py-1.5 rounded-lg text-center shadow-sm min-w-[50px]">
                                <span className="block text-xs font-bold uppercase text-red-500">{new Date(event.start_date).toLocaleString('default', { month: 'short' })}</span>
                                <span className="block text-lg font-black leading-none">{new Date(event.start_date).getDate()}</span>
                              </div>
                              <div className="absolute bottom-3 left-3 right-3 text-white">
                                <h3 className="font-black text-xl leading-tight line-clamp-2">{event.title}</h3>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/90">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 backdrop-blur-md"><MapPin className="w-3 h-3" /> {event.location || locationName}</span> 
                                  <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 backdrop-blur-md"><Ticket className="w-3 h-3" /> {formatTicketPrice(event.ticket_price)}</span>
                                  {event.distanceKm != null && <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 backdrop-blur-md">{event.distanceKm}km</span>}
                                  <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 backdrop-blur-md"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(event.start_date), { addSuffix: true })}</span>
                                </div>
                              </div>
                            </div>

                            <CardContent className="p-4">
                              <h3 className="sr-only">{event.title}</h3>
                               <div className="flex items-center text-xs text-muted-foreground gap-3">
                                <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {event.location || locationName}</span> 
                              </div> 
                              
                              <div className="mt-4 flex items-center justify-between">
                                {/* --- Explorer UI: Large Avatar Stacks for Social Proof --- */}
                                <div className="flex items-center -space-x-3">
                                  {(event.friend_images || []).slice(0, 4).map((img, i) => (
                                    <Avatar key={i} className="w-9 h-9 border-2 border-background shadow-sm">
                                      <AvatarImage src={img} />
                                      <AvatarFallback>?</AvatarFallback>
                                    </Avatar>
                                  ))}
                                  <div className="text-xs text-muted-foreground pl-4 font-semibold">
                                    {event.friend_images?.length ? (
                                      <span className="text-primary">{event.friend_images.length === 1 ? "friend" : "friends"} in your circle are going</span>
                                    ) : (
                                      <span>{event.attendee_count || 0} attending</span>
                                    )}
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
                  <div className="flex items-center gap-2 text-white/80 text-sm font-medium"><Calendar className="w-4 h-4" /> {new Date(selectedEvent.start_date).toLocaleDateString()} in {milestone?.zone_name}</div>
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
                  <div className="bg-muted/30 p-3 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Time</p><p className="font-black">{new Date(selectedEvent.start_date).toLocaleTimeString([], {timeStyle: 'short'})}</p></div>
                  <div className="bg-muted/30 p-3 rounded-xl"><p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Price</p><p className="font-black">{selectedEvent.ticket_price ? `₦${selectedEvent.ticket_price.toLocaleString()}` : 'Free'}</p></div>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed italic">{selectedEvent.description}</div>
              </div>
              <DialogFooter className="p-4 border-t sticky bottom-0 bg-background grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-12 rounded-xl font-bold" onClick={() => addToCalendar(selectedEvent)}><Calendar className="w-4 h-4 mr-2" /> ADD TO CAL </Button>
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
