import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Calendar, MapPin, X, Loader2, Plus, 
  Heart, Share2, Sparkles, Lock, RefreshCw, Check,
  Clock, Ticket, ExternalLink, Megaphone
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// --- TYPES ---
interface Profile { id: string; display_name: string | null; avatar_url: string | null; }
interface Story { id: string; content: string | null; created_at: string; author_id: string | null; }
interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
  cover_url?: string | null;
  is_member?: boolean;
  my_role?: 'admin' | 'member' | null;
}

interface Event { 
  id: string; 
  title: string;
  start_date: string;
  location: string | null; 
  image_url?: string; 
  match_score?: number;
  description?: string;
  end_date?: string;
  price?: number;
  attendee_count?: number;
  is_attending?: boolean;
  is_sponsored?: boolean;
}

type ProfileWithStoryInner = { id: string; display_name: string | null; avatar_url: string | null; stories: { id: string; created_at: string }[]; };

// --- EVENT DETAIL MODAL ---
function EventDetailModal({ event, isOpen, onClose, onRSVP }: { 
  event: Event | null; 
  isOpen: boolean; 
  onClose: () => void;
  onRSVP: (eventId: string) => void;
}) {
  if (!event) return null;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        {event.image_url && (
          <div className="w-full h-48 bg-muted relative">
            <img 
              src={event.image_url} 
              alt={event.title}
              className="w-full h-full object-cover"
            />
            {event.match_score && (
              <Badge className="absolute top-4 right-4 bg-black/60 backdrop-blur-md">
                <Sparkles className="w-3 h-3 mr-1 text-yellow-400" />
                {event.match_score.toFixed(0)}% Match
              </Badge>
            )}
            {event.is_sponsored && (
              <Badge className="absolute top-4 left-4 bg-yellow-500/90 hover:bg-yellow-600 text-white backdrop-blur-md border-0">
                <Megaphone className="w-3 h-3 mr-1" />
                Sponsored
              </Badge>
            )}
          </div>
        )}
        
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{event.title}</h2>
            {event.description && (
              <p className="text-muted-foreground">{event.description}</p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">When</p>
                <p className="text-sm text-muted-foreground">{formatDate(event.start_date)}</p>
                {event.end_date && (
                  <p className="text-sm text-muted-foreground">to {formatDate(event.end_date)}</p>
                )}
              </div>
            </div>

            {event.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Where</p>
                  <p className="text-sm text-muted-foreground">{event.location}</p>
                </div>
              </div>
            )}

            {event.price !== undefined && (
              <div className="flex items-start gap-3">
                <Ticket className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Price</p>
                  <p className="text-sm text-muted-foreground">
                    {event.price === 0 ? 'Free' : `$${event.price}`}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Attendees</p>
                <p className="text-sm text-muted-foreground">{event.attendee_count || 0} going</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button 
              onClick={() => {
                onRSVP(event.id);
                onClose();
              }}
              className={event.is_attending ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {event.is_attending ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Going
                </>
              ) : (
                <>
                  <Ticket className="w-4 h-4 mr-2" />
                  RSVP
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- UI COMPONENTS ---
const FeedSkeleton = () => (
  <div className="space-y-4">
    {[1, 2].map(i => (
      <Card key={i} className="border-0 shadow-sm bg-card/50">
        <CardContent className="p-4 flex gap-4 items-center">
          <div className="w-14 h-14 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-3 w-1/3 bg-muted/50 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

const EmptyState = ({ icon: Icon, title, desc, action, onAction }: any) => (
  <Card className="border-2 border-dashed border-muted bg-muted/5 shadow-none py-8">
    <CardContent className="flex flex-col items-center text-center space-y-3">
      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mb-2"><Icon className="w-8 h-8 text-muted-foreground/50" /></div>
      <h3 className="font-semibold text-lg text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{desc}</p>
      {action && <Button variant="outline" className="mt-4" onClick={onAction}>{action}</Button>}
    </CardContent>
  </Card>
);

function StoryViewer({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      const yesterday = new Date(Date.now() - 864e5).toISOString();
      const { data } = await supabase.from('stories').select('id, content, created_at, author_id').eq('author_id', user.id).gte('created_at', yesterday).order('created_at', { ascending: true });
      if (data) setStories(data);
      setLoading(false);
    };
    load();
  }, [user.id]);

  const current = stories[index];
  const next = () => index < stories.length - 1 ? (setIndex(i => i + 1), setLiked(false)) : onClose();

  if (loading) return <div className="fixed inset-0 z-50 bg-black flex items-center justify-center"><Loader2 className="text-white animate-spin" /></div>;
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center sm:p-4 animate-in fade-in duration-300">
      <button onClick={onClose} className="absolute top-6 right-6 z-50 text-white/80 hover:text-white"><X className="w-8 h-8" /></button>
      <div className="relative w-full h-full sm:max-w-md sm:h-[85vh] bg-black sm:rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl">
        <div className="absolute top-0 w-full z-20 flex gap-1 p-2">
          {stories.map((_, i) => <div key={i} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm"><div className={`h-full bg-white transition-all duration-300 ${i <= index ? 'w-full' : 'w-0'}`} /></div>)}
        </div>
        <div className="absolute top-6 left-0 w-full p-4 z-20 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent">
          <img src={user.avatar_url || '/default-avatar.png'} className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" alt={user.display_name || 'User'} />
          <span className="text-white font-bold text-sm drop-shadow-md">{user.display_name || 'User'}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-black relative" onClick={next}>
          <div className="w-full h-full flex items-center justify-center p-8">
            <p className="text-white text-xl text-center">{current.content || ''}</p>
          </div>
        </div>
        <div className="absolute bottom-0 w-full p-4 z-30 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex gap-3 pb-8">
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Reply..." className="bg-white/10 border-white/10 text-white placeholder:text-white/60 rounded-full backdrop-blur-md focus-visible:ring-0" onClick={(e) => e.stopPropagation()} />
          <Button size="icon" variant="ghost" className="text-white rounded-full hover:bg-white/10" onClick={(e) => { e.stopPropagation(); setLiked(!liked); toast.success("Reaction sent ❤️"); }}><Heart className={`w-7 h-7 transition-transform active:scale-125 ${liked ? 'fill-red-500 text-red-500' : ''}`} /></Button>
          <Button size="icon" variant="ghost" className="text-white rounded-full hover:bg-white/10"><Share2 className="w-7 h-7" /></Button>
        </div>
      </div>
    </div>
  );
}

export default function Discover() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [storyUsers, setStoryUsers] = useState<Profile[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [smartFeed, setSmartFeed] = useState<Event[]>([]);
  const [selectedStory, setSelectedStory] = useState<Profile | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  
  const [preview, setPreview] = useState<{ file: File, url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    
    const init = async () => {
      console.log("🔍 Initializing Discover page for user:", user.id);

      // 1. Profiles
      const { data: me } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (me) {
        setCurrentUserProfile({ id: me.id, display_name: me.display_name, avatar_url: me.avatar_url });
      }
      
      const yesterday = new Date(Date.now() - 864e5).toISOString();
      const { data: storyData } = await supabase.from('profiles').select('id, display_name, avatar_url, stories:stories!author_id(id, created_at)').filter('stories.created_at', 'gte', yesterday).returns<ProfileWithStoryInner[]>();
      if (storyData) setStoryUsers(Array.from(new Map(storyData.map(i => [i.id, { id: i.id, display_name: i.display_name, avatar_url: i.avatar_url }])).values()));

      // 2. Communities with membership status
      const { data: comms, error: commsError } = await supabase
        .from('communities')
        .select('id, name, description, member_count, avatar_url, cover_url')
        .order('created_at', { ascending: false })
        .limit(20);

      if (commsError) {
        console.error("❌ Communities fetch error:", commsError);
      } else {
        console.log("🏛️ Communities fetched:", comms?.length);
      }
      
      if (comms && comms.length > 0) {
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', user.id);
        
        const membershipMap = new Map(memberships?.map(m => [m.community_id, m.role]) || []);
        
        const enrichedComms: Community[] = comms.map((c: any) => {
          const isMember = membershipMap.has(c.id);
          const role = membershipMap.get(c.id) as 'admin' | 'member' | undefined;
  
          console.log(`✅ Community: "${c.name}" - Members: ${c.member_count || 0} - Cover: ${c.cover_url ? 'Yes' : 'No'} - Joined: ${isMember}`);
  
          return {
            id: c.id,
            name: c.name,
            member_count: c.member_count || 0,
            description: c.description,
            avatar_url: c.cover_url || c.avatar_url,
            cover_url: c.cover_url,
            is_member: isMember,
            my_role: role || null
          };
        });
        setCommunities(enrichedComms);
      }
      
      // 3. Events with RSVP status
      const { data: evts, error: evtsError } = await supabase
        .from('events')
        .select('*')
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(20);
      
      if (evtsError) {
        console.error("❌ Events fetch error:", evtsError);
      } else {
        console.log("📅 Events fetched:", evts?.length);
      }
      
      if (evts) {
        const eventIds = evts.map((e: any) => e.id);
        const { data: rsvps } = await supabase
          .from('event_attendees')
          .select('event_id')
          .eq('user_id', user.id)
          .in('event_id', eventIds);

        const rsvpSet = new Set(rsvps?.map(r => r.event_id) || []); 

        const { data: attendeeCounts } = await supabase
          .from('event_attendees')
          .select('event_id')
          .in('event_id', eventIds)
          .eq('status', 'confirmed');

        const attendeeMap = new Map<string, number>();
        attendeeCounts?.forEach((a: any) => {
          attendeeMap.set(a.event_id, (attendeeMap.get(a.event_id) || 0) + 1);
        });

        const mappedEvents: Event[] = evts.map((e: any) => {
          const attendeeCount = attendeeMap.get(e.id) || e.attendee_count || 0;
          const isAttending = rsvpSet.has(e.id);
          
          console.log(`✅ Event: "${e.title}" - Attendees: ${attendeeCount} - Attending: ${isAttending} - Sponsored: ${e.is_sponsored || false}`);
  
          return {
            id: e.id,
            title: e.title,
            start_date: e.start_date,
            end_date: e.end_date,
            location: e.location,
            image_url: e.image_url,
            description: e.description,
            price: e.price,
            attendee_count: attendeeCount,
            is_attending: isAttending,
            is_sponsored: e.is_sponsored || false
          };
        });
        setEvents(mappedEvents);
      }

      // 4. Premium & AI
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single();

      const prem = sub?.status === 'active';
      setIsPremium(prem);
      console.log("💎 Premium status:", prem);

      if (prem) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;

            try {
              console.log("🤖 Calling AI Edge Function...");
              const { data: ai, error } = await supabase.functions.invoke('generate-smart-feed', {
                body: {
                  user_id: user.id,
                  user_lat: latitude,
                  user_long: longitude,
                },
              });

              if (error) {
                console.error("❌ AI Feed Error:", error);
                throw error;
              }

              if (ai) {
                const formatted: Event[] = ai.map((item: any) => ({
                  id: item.id,
                  title: item.title,
                  start_date: item.start_date || new Date().toISOString(),
                  location: item.location || 'Online',
                  image_url: item.image_url,
                  match_score: (item.final_score || item.similarity || 0) * 100,
                  is_sponsored: item.is_sponsored,
                  attendee_count: item.attendee_count || 0,
                  is_attending: item.is_attending || false,
                }));
                console.log("✅ AI Feed generated:", formatted.length, "events");
                setSmartFeed(formatted);
              }
            } catch (err) {
              console.error('❌ AI Feed Error:', err);
            } finally {
              setLoading(false);
            }
          },
          (err) => {
            console.warn('⚠️ Location denied, falling back to basic AI', err);
            setLoading(false);
          }
        );
      } else {
        setLoading(false);
      }

      console.log("✅ Discover page initialization complete");
    };

    init();
  }, [user]);

  const handleUpload = async () => {
    if (!preview || !user) return;
    setUploading(true);
    try {
      const ext = preview.file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      await supabase.storage.from('stories').upload(path, preview.file);
      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);
      await supabase.from('stories').insert({ 
        author_id: user.id, 
        content: caption || 'New story'
      });
      toast.success("Story posted!");
      setPreview(null);
      setCaption("");
      window.location.reload();
    } catch (e) { 
      console.error("❌ Story upload error:", e);
      toast.error("Upload failed"); 
    }
    setUploading(false);
  };

  const handleJoinCommunity = async (communityId: string) => {
    if (!user) return;
    try {
      console.log("👥 Joining community:", communityId);
      
      const { error } = await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: user.id,
        role: 'member'
      });
      
      if (error) {
        console.error("❌ Join error:", error);
        throw error;
      }
      
      const { error: incrementError } = await supabase.rpc('increment_community_members', { 
        community_id: communityId 
      });
      
      if (incrementError) {
        console.warn("⚠️ Failed to increment count:", incrementError);
      }
      
      toast.success("Joined community!");
      
      setCommunities(prev => prev.map(c => 
        c.id === communityId 
          ? { 
              ...c, 
              is_member: true, 
              my_role: 'member', 
              member_count: (c.member_count || 0) + 1
            }
          : c
      ));
      
      console.log("✅ Successfully joined community");
    } catch (e: any) {
      console.error("❌ Join community error:", e);
      toast.error(e.message || "Failed to join");
    }
  };

  const handleRSVP = async (eventId: string) => {
  if (!user) return;
  
  try {
    const event = events.find(e => e.id === eventId) || smartFeed.find(e => e.id === eventId);
    console.log("🎟️ RSVP for event:", eventId, "- Currently attending:", event?.is_attending, "- Price:", event?.price);
    
    if (event?.is_attending) {
      // Cancel RSVP
      const { error } = await supabase.from('event_attendees').delete().match({
        event_id: eventId,
        user_id: user.id
      });
      
      if (error) throw error;
      
      const { error: decrementError } = await supabase.rpc('decrement_event_attendees', { 
        event_id: eventId 
      });
      
      if (decrementError) {
        console.warn("⚠️ Failed to decrement count:", decrementError);
      }
      
      toast.success("RSVP cancelled");
      console.log("✅ RSVP cancelled");
    } else {
             const { error } = await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: user.id,
        status: 'confirmed'
      });
      
      if (error) throw error;
      
      const { error: incrementError } = await supabase.rpc('increment_event_attendees', { 
        event_id: eventId 
      });
      
      if (incrementError) {
        console.warn("⚠️ Failed to increment count:", incrementError);
      }
      
      toast.success(event?.price && event.price > 0 
        ? `Ticket purchased! You're going! 🎉` 
        : `You're going! 🎉`
      );
      console.log("✅ RSVP confirmed");
    }
    
    // Update local state for events list
    setEvents(prev => prev.map(e => 
      e.id === eventId 
        ? { 
            ...e, 
            is_attending: !e.is_attending,
            attendee_count: (e.attendee_count || 0) + (e.is_attending ? -1 : 1)
          }
        : e
    ));
    
    // Update local state for smart feed
    setSmartFeed(prev => prev.map(e => 
      e.id === eventId 
        ? { 
            ...e, 
            is_attending: !e.is_attending,
            attendee_count: (e.attendee_count || 0) + (e.is_attending ? -1 : 1)
          }
        : e
    ));
  } catch (e: any) {
    console.error("❌ RSVP error:", e);
    toast.error(e.message || "Failed to RSVP");
  }
};
  
  return (
    <div className="container-mobile py-4 space-y-6 pb-24">
      {/* STORIES TRAY */}
      <div className="w-full overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
        {loading ? (
          <div className="flex gap-4">
            <div className="w-16 h-16 bg-muted rounded-full animate-pulse" />
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group" onClick={() => fileRef.current?.click()}>
              <input type="file" ref={fileRef} className="hidden" accept="image/*,video/*" onChange={(e) => e.target.files?.[0] && setPreview({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) })} />
              <div className="w-16 h-16 rounded-full p-[2px] border-2 border-dashed border-muted-foreground/30 relative group-hover:border-primary transition-colors">
                <img src={currentUserProfile?.avatar_url || '/default-avatar.png'} className="w-full h-full rounded-full object-cover opacity-50" alt="Your avatar" />
                <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-full"><Plus className="w-6 h-6 text-primary drop-shadow-sm" /></div>
              </div>
              <span className="text-xs font-medium text-muted-foreground">Add Story</span>
            </div>
            {storyUsers.map(u => u.id !== user?.id && (
              <div key={u.id} className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0 group" onClick={() => setSelectedStory(u)}>
                <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-orange-500 to-purple-600 group-hover:scale-105 transition-transform shadow-sm">
                  <img src={u.avatar_url || '/default-avatar.png'} className="w-full h-full rounded-full object-cover border-2 border-background" alt={u.display_name || 'User'} />
                </div>
                <span className="text-xs font-medium max-w-[70px] truncate">{u.display_name || 'User'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-0">
          <DialogHeader><DialogTitle>Create Story</DialogTitle></DialogHeader>
          <div className="aspect-[9/16] bg-black/10 rounded-xl overflow-hidden flex items-center justify-center relative border">
            {preview?.file.type.startsWith('video') ? <video src={preview.url} controls className="max-h-full max-w-full" /> : <img src={preview?.url} className="max-h-full max-w-full object-contain" alt="Preview" />}
          </div>
          <div className="space-y-4 pt-2">
            <Input placeholder="Add a caption..." value={caption} onChange={e => setCaption(e.target.value)} className="bg-muted/50 border-0" />
            <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={handleUpload} disabled={uploading} className="gradient-primary text-white">{uploading ? <Loader2 className="animate-spin" /> : 'Share to Story'}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* TABS */}
      <div className="px-1">
        <h1 className="text-2xl font-bold mb-4 tracking-tight">Discover</h1>
        <Tabs defaultValue="communities">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="communities" className="rounded-lg">Communities</TabsTrigger>
            <TabsTrigger value="events" className="rounded-lg">Events</TabsTrigger>
            <TabsTrigger value="foryou" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg"><Sparkles className="w-3 h-3 mr-1" /> For You</TabsTrigger>
          </TabsList>

          {/* Communities */}
          <TabsContent value="communities" className="mt-6 space-y-3 animate-in fade-in-50">
            {loading ? <FeedSkeleton /> : communities.length === 0 ? (
              <EmptyState icon={Users} title="No Communities Yet" desc="Be the first to start a tribe in your area." action="Create Community" onAction={() => navigate('/app/messages')} />
            ) : (
              communities.map(c => (
                <Card key={c.id} className="hover:shadow-md transition-all border-border/50 cursor-pointer">
                  <CardContent className="p-4 flex gap-4 items-center">
                    <img 
                      src={c.cover_url || c.avatar_url || '/default-avatar.png'} 
                      className="w-14 h-14 rounded-2xl bg-muted object-cover" 
                      alt={c.name}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate text-lg">{c.name}</h3>
                        {c.is_member && (
                          <Badge variant="secondary" className="text-xs">
                            {c.my_role === 'admin' ? 'Admin' : 'Joined'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium">
                        <Users className="w-3 h-3" /> {c.member_count} members
                      </div>
                    </div>
                    {c.is_member ? (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="rounded-full px-4"
                        onClick={() => navigate('/app/messages')}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Open
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="rounded-full px-4"
                        onClick={() => handleJoinCommunity(c.id)}
                      >
                        Join
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Events */}
          <TabsContent value="events" className="mt-6 space-y-3 animate-in fade-in-50">
            {loading ? <FeedSkeleton /> : events.length === 0 ? (
               <EmptyState icon={Calendar} title="No Upcoming Events" desc="It's quiet... too quiet. Host a party!" action="Create Event" onAction={() => navigate('/create-event')} />
            ) : (
              events.map(e => (
                <Card 
                  key={e.id} 
                  className="hover:shadow-md transition-all border-border/50 cursor-pointer"
                  onClick={() => setSelectedEvent(e)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-14 h-16 rounded-xl bg-primary/5 border border-primary/10 flex flex-col items-center justify-center text-primary flex-shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                        {new Date(e.start_date).toLocaleString('default', {month:'short'})}
                      </span>
                      <span className="text-xl font-bold leading-none">
                        {new Date(e.start_date).getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
  <div className="flex items-center gap-2">
    <h3 className="font-bold text-base truncate">{e.title}</h3>
    {e.is_attending && (
      <Badge className="bg-green-600 text-xs">
        <Check className="w-3 h-3 mr-1" />
        Going
      </Badge>
    )}
    {e.is_sponsored && (
      <Badge variant="outline" className="text-[10px] h-5 border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 px-1.5">
        Sponsored
      </Badge>
    )}
    {/* ADDED: Show price badge */}
    {e.price !== undefined && e.price > 0 && (
      <Badge variant="outline" className="text-[10px] h-5 border-primary text-primary">
        ${e.price}
      </Badge>
    )}
  </div>
  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
    <MapPin className="w-3.5 h-3.5" /> 
    <span className="truncate">{e.location}</span>
  </div>
  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
    <Users className="w-3 h-3" />
    {e.attendee_count || 0} attending
  </div>
</div>
                    <Button 
                      size="sm" 
                      variant={e.is_attending ? "default" : "outline"}
                      className="rounded-full"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        setSelectedEvent(e);
                      }}
                    >
                      View
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* For You (AI) */}
          <TabsContent value="foryou" className="mt-6 space-y-4 animate-in fade-in-50">
            {!isPremium ? (
              <Card className="bg-gradient-to-br from-indigo-900 to-purple-900 border-0 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                <CardContent className="flex flex-col items-center justify-center py-12 text-center relative z-10">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-md shadow-inner border border-white/20"><Lock className="w-8 h-8 text-white drop-shadow-lg" /></div>
                  <h3 className="text-xl font-bold mb-2">Unlock AI Insights</h3>
                  <p className="text-white/70 max-w-xs mb-6 text-sm leading-relaxed">See events matched to your interests.</p>
                  <Button variant="secondary" className="font-bold shadow-lg" onClick={() => navigate('/premium')}>Upgrade to Premium</Button>
                </CardContent>
              </Card>
            ) : smartFeed.length === 0 ? (
               <EmptyState icon={RefreshCw} title="Analyzing..." desc="AI is learning your preferences." action="Refresh" onAction={() => window.location.reload()} />
            ) : (
              smartFeed.map(e => (
                <Card 
                  key={e.id} 
                  className="overflow-hidden border-purple-200 dark:border-purple-900 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setSelectedEvent(e)}
                >
                  <div className="h-32 bg-muted relative">
                    {e.image_url && <img src={e.image_url} className="w-full h-full object-cover" alt={e.title} />}
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md flex gap-1 font-bold items-center">
                      <Sparkles className="w-3 h-3 text-yellow-400" /> 
                      {(e.match_score || 95).toFixed(0)}% Match
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold truncate text-lg">{e.title}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {e.location}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      {selectedStory && <StoryViewer user={selectedStory} onClose={() => setSelectedStory(null)} />}
      
      <EventDetailModal 
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onRSVP={handleRSVP}
      />
    </div>
  );
}
