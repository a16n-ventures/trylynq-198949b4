import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Calendar, MapPin, X, Loader2, Plus, 
  Heart, Share2, Sparkles, Lock, RefreshCw, Check,
  Ticket, Megaphone, MessageSquare,
  MoreVertical, Trash2, Copy, Eye, Clock
} from "lucide-react";
import { formatDistanceToNow, isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns"; 
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// --- TYPES ---
interface Profile { id: string; display_name: string | null; avatar_url: string | null; }
interface Story { 
  id: string; 
  content: string | null; 
  created_at: string; 
  author_id: string | null;
  media_url?: string | null; 
  media_type?: 'image' | 'video' | string | null; 
  view_count?: number;
}
interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
  cover_url?: string | null;
  is_member?: boolean;
  my_role?: 'admin' | 'member' | string | null;
  match_score?: number; 
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

type ProfileWithStoryInner = { id: string; display_name: string | null; avatar_url: string | null; stories: Story[]; };

// --- EVENT STATUS HELPER ---
const getEventStatus = (startDate: string) => {
  const date = new Date(startDate);
  const now = new Date();
  const expirationTime = addHours(date, 3); // 3-hour duration assumption

  // If start date is past but still within active window
  if (isPast(date) && now < expirationTime) {
    if (differenceInMinutes(expirationTime, now) < 30) {
      return { label: 'Ending Soon', color: 'bg-orange-500' };
    }
    return { label: 'Happening Now', color: 'bg-green-600' };
  }

  if (isToday(date)) return { label: 'Today', color: 'bg-blue-500' };
  if (isFuture(date)) {
    const hoursUntil = differenceInMinutes(date, now) / 60;
    if (hoursUntil <= 24) return { label: 'Starting Soon', color: 'bg-amber-500' };
    return { label: 'Upcoming', color: 'bg-primary' };
  }
  
  return { label: 'Past', color: 'bg-muted-foreground' };
};

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
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto p-0 overflow-hidden">
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

interface CommunityDetailModalProps {
  community: Community | null;
  isOpen: boolean;
  onClose: () => void;
  onJoin: (communityId: string) => void;
  onOpen: () => void;
}

function CommunityDetailModal({ 
  community, 
  isOpen, 
  onClose, 
  onJoin,
  onOpen 
}: CommunityDetailModalProps) {
  if (!community) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto p-0 overflow-hidden">
        {(community.cover_url || community.avatar_url) && (
          <div className="w-full h-48 bg-muted relative">
            <img 
              src={community.cover_url || community.avatar_url || '/default-avatar.png'} 
              alt={community.name}
              className="w-full h-full object-cover"
            />
            {community.is_member && (
              <Badge className="absolute top-4 right-4 bg-green-600 backdrop-blur-md border-0">
                <Check className="w-3 h-3 mr-1" />
                {community.my_role === 'admin' ? 'Admin' : 'Joined'}
              </Badge>
            )}
            {community.match_score && (
              <Badge className="absolute top-4 left-4 bg-black/60 backdrop-blur-md">
                <Sparkles className="w-3 h-3 mr-1 text-yellow-400" />
                {community.match_score.toFixed(0)}% Match
              </Badge>
            )}
          </div>
        )}
        
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{community.name}</h2>
            {community.description && (
              <p className="text-muted-foreground">{community.description}</p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Members</p>
                <p className="text-sm text-muted-foreground">
                  {community.member_count || 0} {community.member_count === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>

            {community.my_role && (
              <div className="flex items-start gap-3">
                <Badge className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3" />
                </Badge>
                <div>
                  <p className="font-medium">Your Role</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {community.my_role}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Community Type</p>
                <p className="text-sm text-muted-foreground">
                  Public • Open to join
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t pt-4 flex-col sm:flex-row">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Close
            </Button>
            
            {community.is_member ? (
              <Button 
                onClick={() => {
                  onOpen();
                  onClose();
                }}
                className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Open Community
              </Button>
            ) : (
              <Button 
                onClick={() => {
                  onJoin(community.id);
                  onClose();
                }}
                className="w-full sm:w-auto"
              >
                <Users className="w-4 h-4 mr-2" />
                Join Community
              </Button>
            )}
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

// ✅ FIXED: Wrapped in Dialog for reliable opening (z-index fix)
function StoryViewer({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { user: currentUser } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [msg, setMsg] = useState("");
  const [showActions, setShowActions] = useState(false); 
  const [viewCount, setViewCount] = useState(0);
  const [incomingHearts, setIncomingHearts] = useState<{ id: number, left: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      // Fetch stories using Auth ID (user.id)
      const yesterday = new Date(Date.now() - 864e5).toISOString();
      const { data } = await supabase
        .from('stories')
        .select('id, content, created_at, author_id, media_url, media_type, view_count')
        .eq('author_id', user.id) 
        .gte('created_at', yesterday)
        .order('created_at', { ascending: true });
      
      if (data && data.length > 0) {
        setStories(data);
        setViewCount(data[0].view_count || 0);
      } else {
        onClose(); // Close if no stories found
      }
      setLoading(false);
    };
    load();
  }, [user.id]);

  const current = stories[index];
  const isMyStory = currentUser?.id === user.id; 
  
  // Realtime Logic: Record View & Subscribe
  useEffect(() => {
    if (!current || !currentUser) return;

    // 1. Record View (Only if not my own story)
    if (!isMyStory) {
      const recordView = async () => {
        await supabase.rpc('increment_story_view', { story_id: current.id, viewer_id: currentUser.id });
      };
      recordView();
    }

    // 2. Subscribe to Realtime Updates (Views & Likes)
    const channel = supabase
      .channel(`story-${current.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories', filter: `id=eq.${current.id}` },
        (payload: any) => {
          if (payload.new.view_count !== undefined) {
            setViewCount(payload.new.view_count);
          }
        }
      )
      .on(
        'postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'story_likes', filter: `story_id=eq.${current.id}` },
        (payload) => {
          if (payload.new.user_id !== currentUser.id) {
             const id = Date.now();
             setIncomingHearts(prev => [...prev, { id, left: Math.random() * 80 + 10 }]);
             setTimeout(() => setIncomingHearts(prev => prev.filter(h => h.id !== id)), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [current?.id, isMyStory, currentUser]);

  const next = () => {
    if (index < stories.length - 1) {
      setIndex(i => i + 1);
      setLiked(false);
      setViewCount(stories[index + 1].view_count || 0); 
    } else {
      onClose();
    }
  };

  const handleLike = async () => {
    if (!current || !currentUser) return;
    setLiked(true);
    setIncomingHearts(prev => [...prev, { id: Date.now(), left: 50 }]); // Show my own heart
    
    const { error } = await supabase.from('story_likes').insert({
      story_id: current.id,
      user_id: currentUser.id
    });
    
    if (error) console.error("Error liking story:", error);
    toast.success("Reaction sent ❤️");
  };

  const handleDeleteStory = async () => {
    if (!current || !currentUser) return;
    
    const confirmed = window.confirm('Delete this story? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', current.id)
        .eq('author_id', currentUser.id);
      
      if (error) throw error;
      
      if (current.media_url) {
        const path = current.media_url.split('/').slice(-3).join('/');
        await supabase.storage.from('stories').remove([path]);
      }
      
      toast.success('Story deleted');
      
      if (stories.length === 1) {
        onClose();
        window.location.reload(); 
      } else {
        setStories(prev => prev.filter(s => s.id !== current.id));
        if (index >= stories.length - 1) setIndex(Math.max(0, index - 1));
      }
      
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete story');
    }
  };

  const handleShareToDM = () => {
    toast.info('Share to DM - Coming soon!');
  };

  if (loading) return null; // Wait for load
  if (!current) return null;

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent shadow-none gap-0 outline-none h-full sm:h-auto flex flex-col justify-center items-center">
        <div className="relative w-full h-full sm:h-[75vh] max-h-[800px] bg-black sm:rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl">
          <div className="absolute top-0 w-full z-20 flex gap-1 p-2">
            {stories.map((_, i) => (
              <div key={i} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div className={`h-full bg-white transition-all duration-300 ${i <= index ? 'w-full' : 'w-0'}`} />
              </div>
            ))}
          </div>
          
          <div className="absolute top-6 left-0 w-full p-4 z-20 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent">
            <img 
              src={user.avatar_url || '/default-avatar.png'} 
              className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" 
              alt={user.display_name || 'User'}
            />
            <div className="flex-1">
              <span className="text-white font-bold text-sm drop-shadow-md block">
                {isMyStory ? 'Your Story' : (user.display_name || 'User')}
              </span>
              <span className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
              </span>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-2">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {isMyStory && (
            <button 
              onClick={() => setShowActions(!showActions)} 
              className="absolute top-6 right-16 z-50 text-white/80 hover:text-white p-2"
            >
              <MoreVertical className="w-6 h-6" />
            </button>
          )}

          {/* Floating Hearts */}
          <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
            {incomingHearts.map((h) => (
              <div 
                key={h.id}
                className="absolute bottom-20 text-4xl animate-float-up"
                style={{ left: `${h.left}%`, transition: 'transform 2s ease-out, opacity 2s ease-out' }}
              >
                ❤️
              </div>
            ))}
          </div>
          
          {isMyStory && showActions && (
            <div className="absolute top-20 right-4 z-30 bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <button 
                onClick={handleDeleteStory}
                className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-3 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-medium">Delete Story</span>
              </button>
              <button 
                onClick={handleShareToDM}
                className="w-full px-4 py-3 text-left text-white hover:bg-white/10 flex items-center gap-3 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">Share to DM</span>
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(current.media_url || current.content || '');
                  toast.success('Copied!');
                }}
                className="w-full px-4 py-3 text-left text-white hover:bg-white/10 flex items-center gap-3 transition-colors"
              >
                <Copy className="w-4 h-4" />
                <span className="text-sm font-medium">Copy</span>
              </button>
            </div>
          )}
          
          <div className="flex-1 flex items-center justify-center bg-black relative" onClick={next}>
            <div className="w-full h-full flex items-center justify-center p-4">
              {current.media_url ? (
                current.media_type === 'video' ? (
                  <video 
                    src={current.media_url} 
                    className="max-w-full max-h-full object-contain rounded-lg"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img 
                    src={current.media_url} 
                    className="max-w-full max-h-full object-contain rounded-lg"
                    alt="Story"
                  />
                )
              ) : (
                <p className="text-white text-xl text-center px-8 leading-relaxed">
                  {current.content || ''}
                </p>
              )}
            </div>
            
            {current.media_url && current.content && (
              <div className="absolute bottom-20 left-0 right-0 px-6">
                <p className="text-white text-center text-sm bg-black/40 backdrop-blur-sm rounded-full py-2 px-4">
                  {current.content}
                </p>
              </div>
            )}
          </div>
          
          {!isMyStory && (
            <div className="absolute bottom-0 w-full p-4 z-30 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex gap-3 pb-8">
              <Input 
                value={msg} 
                onChange={(e) => setMsg(e.target.value)} 
                placeholder="Reply..." 
                className="bg-white/10 border-white/10 text-white placeholder:text-white/60 rounded-full backdrop-blur-md focus-visible:ring-0" 
                onClick={(e) => e.stopPropagation()} 
              />
              <Button 
                size="icon" 
                variant="ghost" 
                className="text-white rounded-full hover:bg-white/10" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handleLike();
                }}
              >
                <Heart className={`w-7 h-7 transition-transform active:scale-125 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="text-white rounded-full hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShareToDM();
                }}
              >
                <Share2 className="w-7 h-7" />
              </Button>
            </div>
          )}
          
          {isMyStory && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2">
                <Eye className="w-4 h-4 text-white" />
                <span className="text-white text-sm font-medium">{viewCount} views</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Discover() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [storyUsers, setStoryUsers] = useState<ProfileWithStoryInner[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [eventsFilter, setEventsFilter] = useState<'active' | 'past'>('active');
  
  // Smart Feed States
  const [smartEvents, setSmartEvents] = useState<Event[]>([]);
  const [smartCommunities, setSmartCommunities] = useState<Community[]>([]);
  const [smartFeedLoading, setSmartFeedLoading] = useState(false);
  
  const [selectedStory, setSelectedStory] = useState<Profile | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  
  // Upload State
  const [preview, setPreview] = useState<{ file: File, url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      // 1. Fetch Current User Profile
      const { data: me } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (me) {
        setCurrentUserProfile({ id: me.id, display_name: me.display_name, avatar_url: me.avatar_url });
      }
      
      // 2. Fetch Stories
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select('*')
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false });

      if (storyError) {
        console.error('❌ Stories fetch error:', storyError);
      } else if (storyData && storyData.length > 0) {
        
        const authorIds = Array.from(new Set(storyData.map((s: any) => s.author_id)));
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, avatar_url')
          .in('user_id', authorIds); 
          
        const profileMap = new Map();
        profiles?.forEach((p: any) => {
          profileMap.set(p.user_id, p);
        });

        const storyMap = new Map<string, any>();
        
        storyData.forEach((story: any) => {
          const profile = profileMap.get(story.author_id);
          
          if (!profile) return;
          
          if (!storyMap.has(profile.user_id)) {
            storyMap.set(profile.user_id, {
              id: profile.user_id, 
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              stories: []
            });
          }
          
          storyMap.get(profile.user_id).stories.push({
            id: story.id,
            created_at: story.created_at,
            content: story.content,
            media_url: story.media_url,
            media_type: story.media_type,
            view_count: story.view_count || 0
          });
        });
      
        const usersWithStories = Array.from(storyMap.values());
        setStoryUsers(usersWithStories);
      } else {
        setStoryUsers([]);
      }

      // 5. Communities
      const { data: comms } = await supabase
        .from('communities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (comms) {
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', user.id);
        
        const membershipMap = new Map(memberships?.map(m => [m.community_id, m.role]) || []); 

        const communityIds = comms.map(c => c.id);
        const { data: memberCounts } = await supabase
          .from('community_members')
          .select('community_id')
          .in('community_id', communityIds);
        
        const memberCountMap = new Map<string, number>();
        memberCounts?.forEach((m: any) => {
          memberCountMap.set(m.community_id, (memberCountMap.get(m.community_id) || 0) + 1);
        });
              
        const enrichedComms: Community[] = comms.map((c: any) => {
          const isMember = membershipMap.has(c.id);
          const role = membershipMap.get(c.id) as 'admin' | 'member' | undefined;
          const actualMemberCount = memberCountMap.get(c.id) || 0;
          
          return {
            id: c.id,
            name: c.name,
            member_count: actualMemberCount,
            description: c.description,
            avatar_url: c.cover_url || c.avatar_url,
            cover_url: c.cover_url,
            is_member: isMember,
            my_role: role || null
          };
        });
        
        setCommunities(enrichedComms);
      }
      
      // 6. Events - Fetch both active and past events
      // ✅ CHANGED: Set time reference to 3 hours ago to include events currently happening in "Active"
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      
      // Fetch upcoming/active events (Started after 3 hours ago)
      const { data: activeEvts } = await supabase
        .from('events')
        .select('*')
        .gte('start_date', threeHoursAgo) 
        .order('start_date', { ascending: true })
        .limit(20);
      
      // Fetch past events (Started before 3 hours ago)
      const { data: pastEvts } = await supabase
        .from('events')
        .select('*')
        .lt('start_date', threeHoursAgo) 
        .order('start_date', { ascending: false })
        .limit(20);
      
      const processEvents = async (evts: any[] | null): Promise<Event[]> => {
        if (!evts || evts.length === 0) return [];
        
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

        return evts.map((e: any) => {
          const attendeeCount = attendeeMap.get(e.id) || e.attendee_count || 0;
          const isAttending = rsvpSet.has(e.id);
    
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
      };
      
      const [mappedActiveEvents, mappedPastEvents] = await Promise.all([
        processEvents(activeEvts),
        processEvents(pastEvts)
      ]);
      
      setEvents(mappedActiveEvents);
      setPastEvents(mappedPastEvents);

      // Check premium status
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: premiumFeature } = await supabase
        .from('premium_features')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      const isSubscribed = sub?.status === 'active';
      const hasPremiumFeature = !!premiumFeature;

      setIsPremium(isSubscribed || hasPremiumFeature);
      
      setLoading(false);
    };

    init();
  }, [user]);

  // AI Feed Logic (Smart Events & Communities)
  useEffect(() => {
    if (!isPremium || smartEvents.length > 0) return;
    const currentTab = new URLSearchParams(window.location.search).get('tab');
    if (currentTab !== 'foryou') return;
    
    setSmartFeedLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const { data: ai, error } = await supabase.functions.invoke('generate-smart-feed', {
            body: { user_id: user?.id, user_lat: latitude, user_long: longitude },
          });
          if (error) throw error;
          
          if (ai) {
            // Process Events
            if (ai.events) {
              const formattedEvents = ai.events.map((item: any) => ({
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
              setSmartEvents(formattedEvents);
            }

            // Process Communities
            if (ai.communities) {
              const formattedCommunities = ai.communities.map((c: any) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                member_count: c.member_count,
                avatar_url: c.cover_url || c.avatar_url,
                cover_url: c.cover_url,
                match_score: (c.similarity || 0) * 100,
                is_member: false, 
                my_role: null
              }));
              setSmartCommunities(formattedCommunities);
            }
          }
        } catch (err) {
          console.error('AI Feed Error:', err);
        } finally {
          setSmartFeedLoading(false);
        }
      },
      (err) => {
        console.warn('Location denied for Smart Feed', err);
        setSmartFeedLoading(false);
      }
    );
  }, [isPremium, user?.id, window.location.search]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPreview({
        file: e.target.files[0],
        url: URL.createObjectURL(e.target.files[0])
      });
    }
  };

  const handleUpload = async () => {
    if (!preview || !user) return;
    setUploading(true);
    
    try {
      const ext = preview.file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(path, preview.file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('stories')
        .getPublicUrl(path);
      
      const { error: insertError } = await supabase
        .from('stories')
        .insert({ 
          author_id: user.id, 
          content: caption || null,
          media_url: publicUrl,
          media_type: preview.file.type.startsWith('video') ? 'video' : 'image',
          view_count: 0 // Initialize view count
        });
      
      if (insertError) throw insertError;
      
      toast.success("Story posted! 📸");
      setPreview(null);
      setCaption("");
      
      // Simple reload to refresh data
      window.location.reload();
      
    } catch (e: any) {
      console.error("Story upload error:", e);
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleJoinCommunity = async (communityId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: user.id,
        role: 'member'
      });
      if (error) throw error;
      
      await supabase.rpc('increment_community_members', { community_id: communityId });
      toast.success("Joined community!");
      
      // Update both normal and smart lists
      const updateList = (list: Community[]) => list.map(c => 
        c.id === communityId 
          ? { ...c, is_member: true, my_role: 'member', member_count: (c.member_count || 0) + 1 }
          : c
      );
      
      setCommunities(prev => updateList(prev));
      setSmartCommunities(prev => updateList(prev));

    } catch (e: any) {
      toast.error(e.message || "Failed to join");
    }
  };

  // Payment Logic
  const FLUTTERWAVE_PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
  const loadFlutterwaveScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById('flutterwave-script')) { resolve(); return; }
      const script = document.createElement('script');
      script.id = 'flutterwave-script';
      script.src = '[https://checkout.flutterwave.com/v3.js](https://checkout.flutterwave.com/v3.js)';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
      document.body.appendChild(script);
    });
  };
  
  useEffect(() => {
    if (!FLUTTERWAVE_PUBLIC_KEY) return;
    loadFlutterwaveScript().then(() => setScriptLoaded(true)).catch(() => toast.error('Payment system unavailable'));
  }, [FLUTTERWAVE_PUBLIC_KEY]);
  
  const initiateFlutterwavePayment = async (paymentData: any) => {
    try {
      if (!scriptLoaded || !FLUTTERWAVE_PUBLIC_KEY) throw new Error('Payment system not ready');
      
      const { error: transactionError } = await supabase.from('transactions').insert({
        user_id: paymentData.user_id,
        amount: paymentData.amount,
        type: 'purchase',
        status: 'pending',
        description: `Event ticket: ${paymentData.event_title}`,
        reference: paymentData.tx_ref,
        related_id: paymentData.event_id
      });
      
      if (transactionError) throw transactionError;
  
      const config = {
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: paymentData.tx_ref,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_options: "card, banktransfer, ussd",
        customer: { email: paymentData.email, name: paymentData.name, phone_number: paymentData.phone || '' },
        customizations: { title: "Event Ticket Purchase", description: paymentData.event_title, logo: "[https://try.usecorridor.xyz/ahmia/logo.png](https://try.usecorridor.xyz/ahmia/logo.png)" },
        callback: async function(response: any) {
          if (response.status === "successful" || response.status === "completed") {
            const toastId = toast.loading("Confirming your ticket purchase...");
            try {
              const { error: verifyError } = await supabase.functions.invoke('verify-flutterwave-payment', {
                body: { transaction_id: response.transaction_id, tx_ref: paymentData.tx_ref }
              });
              if (verifyError) throw verifyError;
              
              const { error: rsvpError } = await supabase.from('event_attendees').insert({
                event_id: paymentData.event_id, user_id: paymentData.user_id, status: 'confirmed'
              });
              if (rsvpError) throw rsvpError;
              
              await supabase.rpc('increment_event_attendees', { event_id: paymentData.event_id });
              await supabase.from('transactions').update({ status: 'completed', flutterwave_transaction_id: response.transaction_id }).eq('reference', paymentData.tx_ref);
              
              const updateEvents = (list: Event[]) => list.map(e => e.id === paymentData.event_id ? { ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 } : e);
              setEvents(prev => updateEvents(prev));
              setSmartEvents(prev => updateEvents(prev));

              toast.success("Ticket purchased successfully! 🎉", { id: toastId });
            } catch (error: any) {
              toast.error("Payment received but confirmation failed. Contact support.", { id: toastId });
              await supabase.from('transactions').update({ status: 'completed', flutterwave_transaction_id: response.transaction_id }).eq('reference', paymentData.tx_ref);
            }
          } else {
            toast.error("Payment was not successful");
            await supabase.from('transactions').update({ status: 'failed' }).eq('reference', paymentData.tx_ref);
          }
        },
        onclose: function() {}
      };
  
      if (window.FlutterwaveCheckout) window.FlutterwaveCheckout(config);
      else throw new Error("Flutterwave checkout not available");
      
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate payment");
      await supabase.from('transactions').update({ status: 'failed' }).eq('reference', paymentData.tx_ref);
      throw error;
    }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    try {
      const event = events.find(e => e.id === eventId) || smartEvents.find(e => e.id === eventId);
      
      if (event?.is_attending) {
        const { error } = await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        if (error) throw error;
        await supabase.rpc('decrement_event_attendees', { event_id: eventId });
        toast.success("RSVP cancelled");
        
        const updateEvents = (list: Event[]) => list.map(e => e.id === eventId ? { ...e, is_attending: false, attendee_count: (e.attendee_count || 0) - 1 } : e);
        setEvents(prev => updateEvents(prev));
        setSmartEvents(prev => updateEvents(prev));
      } else {
        if (event?.price && event.price > 0) {
          const { data: profile } = await supabase.from('profiles').select('email, display_name, phone').eq('user_id', user.id).single();
          if (!profile) { toast.error("Unable to load your profile."); return; }
          
          const paymentData = {
            amount: event.price,
            currency: 'NGN',
            email: profile.email || user.email || '',
            name: profile.display_name || 'User',
            phone: profile.phone || '',
            tx_ref: `event_${eventId}_${Date.now()}`,
            event_id: eventId,
            event_title: event.title,
            user_id: user.id
          };
          await initiateFlutterwavePayment(paymentData);
          return;
        } else {
          const { error } = await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
          if (error) throw error;
          await supabase.rpc('increment_event_attendees', { event_id: eventId });
          toast.success("You're going! 🎉");
          
          const updateEvents = (list: Event[]) => list.map(e => e.id === eventId ? { ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 } : e);
          setEvents(prev => updateEvents(prev));
          setSmartEvents(prev => updateEvents(prev));
        }
      }
    } catch (e: any) {
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
            {/* Unified Story Bubble Logic */}
            {(() => {
              const myStory = storyUsers.find(u => u.id === user?.id);
              
              const handleLongPress = (e: React.SyntheticEvent) => {
                e.preventDefault();
                // Long press always opens file uploader
                fileRef.current?.click();
              };

              return (
                <div 
                  className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group"
                  // If story exists -> View Story. If no story -> Open Uploader.
                  onClick={() => myStory ? setSelectedStory(myStory) : fileRef.current?.click()}
                  onContextMenu={handleLongPress} // Handles Long Press (Right Click on Desktop)
                >
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileRef} 
                    className="hidden" 
                    accept="image/*,video/*" 
                    onChange={handleFileSelect} 
                  />

                  {/* Bubble Visuals */}
                  <div className={`w-16 h-16 rounded-full p-[3px] ${
                    myStory 
                      ? 'bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400' // Active Story Gradient
                      : 'border-2 border-dashed border-muted-foreground/30' // No Story (Add Mode)
                  } relative group-hover:scale-105 transition-transform shadow-sm`}>
                    
                    <img 
                      src={currentUserProfile?.avatar_url || '/default-avatar.png'} 
                      className={`w-full h-full rounded-full object-cover ${myStory ? 'border-2 border-background' : 'opacity-50'}`} 
                      alt="Your story"
                    />

                    {/* Plus Badge (Only if no story) */}
                    {!myStory && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-full">
                        <div className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1 border-2 border-background">
                           <Plus className="w-3 h-3" />
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-bold max-w-[70px] truncate">Your Story</span>
                </div>
              );
            })()}
            
            {/* Friends Stories */}
            {storyUsers
              .filter(u => u.id !== user?.id)
              .map(u => (
                <div 
                  key={u.id} 
                  className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0 group" 
                  onClick={() => setSelectedStory(u)}
                >
                  <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-orange-500 to-purple-600 group-hover:scale-105 transition-transform shadow-sm">
                    <img 
                      src={u.avatar_url || '/default-avatar.png'} 
                      className="w-full h-full rounded-full object-cover border-2 border-background" 
                      alt={u.display_name || 'User'}
                    />
                  </div>
                  <span className="text-xs font-medium max-w-[70px] truncate">
                    {u.display_name || 'User'}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
      
      {/* Upload Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto bg-background/95 backdrop-blur-xl border-0">
          <DialogHeader>
            <DialogTitle>Create Story</DialogTitle>
          </DialogHeader>
          
          <div className="h-[40vh] max-h-[400px] min-h-[300px] bg-black/10 rounded-xl overflow-hidden flex items-center justify-center relative border group">
            {preview && (
              preview.file.type.startsWith('video') ? (
                <video src={preview.url} controls className="max-h-full max-w-full object-contain" />
              ) : (
                <img src={preview.url} className="max-h-full max-w-full object-contain" alt="Preview" />
              )
            )}
          </div>
          
          <div className="space-y-4 pt-2">
            <Input 
              placeholder="Add a caption..." 
              value={caption} 
              onChange={e => setCaption(e.target.value)} 
              className="bg-muted/50 border-0" 
              maxLength={150}
            />
            <div className="text-xs text-muted-foreground text-right">{caption.length}/150</div>
            
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading} className="gradient-primary text-white">
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : <><Sparkles className="w-4 h-4 mr-2" /> Share</>}
              </Button>
            </DialogFooter>
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
            {/* ✅ FIXED: Reduced icon size */}
            <TabsTrigger value="foryou" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg"><Sparkles className="w-3 h-3 mr-1" /> For You</TabsTrigger>
          </TabsList>

          <TabsContent value="communities" className="mt-6 space-y-3 animate-in fade-in-50">
            {loading ? <FeedSkeleton /> : communities.length === 0 ? (
              <EmptyState 
                icon={Users} 
                title="No Communities Yet" 
                desc="Be the first to start a tribe in your area." 
                action="Create Community" 
                onAction={() => navigate('/app/messages?tab=community')} 
              />
            ) : (
              communities.map(c => (
                <Card 
                  key={c.id} 
                  className="hover:shadow-md transition-all border-border/50 cursor-pointer"
                  onClick={() => setSelectedCommunity(c)}
                >
                  <CardContent className="p-4 flex gap-4 items-center">
                    <img 
                      src={c.cover_url || c.avatar_url || '/default-avatar.png'} 
                      className="w-14 h-14 rounded-2xl bg-muted object-cover" 
                      alt={c.name}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate text-lg">{c.name}</h3>
                        {c.is_member && <Badge variant="secondary" className="text-xs">{c.my_role === 'admin' ? 'Admin' : 'Joined'}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium">
                        {/* ✅ FIXED: Reduced icon size */}
                        <Users className="w-3 h-3" /> {c.member_count} members
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant={c.is_member ? "outline" : "secondary"}
                      className="rounded-full px-4"
                      onClick={(e) => { e.stopPropagation(); setSelectedCommunity(c); }}
                    >
                      View
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="events" className="mt-6 space-y-4 animate-in fade-in-50">
            {/* Active/Past Events Sub-tabs */}
            <div className="flex items-center gap-2 mb-4 bg-muted/30 p-1 rounded-lg w-fit mx-auto">
              <button
                onClick={() => setEventsFilter('active')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${eventsFilter === 'active' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
              >
                Active ({events.length})
              </button>
              <button
                onClick={() => setEventsFilter('past')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${eventsFilter === 'past' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
              >
                Past ({pastEvents.length})
              </button>
            </div>

            {loading ? <FeedSkeleton /> : (
              <>
                {eventsFilter === 'active' && (
                  events.length === 0 ? (
                    <EmptyState icon={Calendar} title="No Upcoming Events" desc="It's quiet... too quiet. Host a party!" action="Create Event" onAction={() => navigate('/create-event')} />
                  ) : (
                    events.map(e => {
                      const status = getEventStatus(e.start_date);
                      return (
                        <Card 
                          key={e.id} 
                          className="hover:shadow-md transition-all border-border/50 cursor-pointer"
                          onClick={() => setSelectedEvent(e)}
                        >
                          <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-14 h-16 rounded-xl bg-primary/5 border border-primary/10 flex flex-col items-center justify-center text-primary flex-shrink-0 relative overflow-hidden">
                                {e.image_url ? (
                                    <img 
                                    src={e.image_url} 
                                    className="absolute inset-0 w-full h-full object-cover"
                                    alt={e.title}
                                    />
                                ) : (
                                    <>
                                    <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                                        {new Date(e.start_date).toLocaleString('default', {month:'short'})}
                                    </span>
                                    <span className="text-xl font-bold leading-none">
                                        {new Date(e.start_date).getDate()}
                                    </span>
                                    </>
                                )}
                              {/* Status indicator dot */}
                              <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${status.color} z-10 border border-white ${status.label === 'Happening Now' ? 'animate-pulse' : ''}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-1.5">
                                <h3 className="font-bold text-base truncate">{e.title}</h3>
                                {/* Status badge */}
                                <Badge className={`text-[10px] px-1.5 py-0 border-0 text-white ${status.color} ${status.label === 'Happening Now' ? 'animate-pulse' : ''}`}>
                                  {status.label}
                                </Badge>
                                {e.is_attending && <Badge className="bg-green-600 text-xs"><Check className="w-3 h-3 mr-1" /> Going</Badge>}
                                {e.is_sponsored && <Badge variant="outline" className="text-[10px] h-5 border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 px-1.5">Sponsored</Badge>}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                <MapPin className="w-3 h-3" /> <span className="truncate">{e.location}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="w-3 h-3" /> {e.attendee_count || 0} attending
                                </div>
                                {e.price !== undefined && (
                                  <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                                    <Ticket className="w-3 h-3" /> {e.price === 0 ? 'Free' : `₦${e.price.toLocaleString()}`}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              variant={e.is_attending ? "default" : "outline"}
                              className="rounded-full"
                              onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }}
                            >
                              View
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })
                  )
                )}

                {eventsFilter === 'past' && (
                  pastEvents.length === 0 ? (
                    <EmptyState icon={Clock} title="No Past Events" desc="You haven't attended any events yet." />
                  ) : (
                    pastEvents.map(e => (
                      <Card 
                        key={e.id} 
                        className="hover:shadow-md transition-all border-border/50 cursor-pointer opacity-80"
                        onClick={() => setSelectedEvent(e)}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-14 h-16 rounded-xl bg-muted border border-muted-foreground/10 flex flex-col items-center justify-center text-muted-foreground flex-shrink-0">
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
                              <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">Past</Badge>
                              {e.is_attending && <Badge className="bg-green-600/50 text-xs"><Check className="w-3 h-3 mr-1" /> Attended</Badge>}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              {/* ✅ FIXED: Reduced icon size */}
                              <MapPin className="w-3 h-3" /> <span className="truncate">{e.location}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {/* ✅ FIXED: Reduced icon size */}
                                <Users className="w-3 h-3" /> {e.attendee_count || 0} attended
                              </div>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="rounded-full"
                            onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }}
                          >
                            View
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )
                )}
              </>
            )}
          </TabsContent>

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
            ) : (
              // ✅ FIXED: Sub-categories shown immediately
              <Tabs defaultValue="smart_events" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 mb-4 rounded-lg">
                  <TabsTrigger value="smart_events" className="text-xs">Smart Events</TabsTrigger>
                  <TabsTrigger value="smart_communities" className="text-xs">Smart Communities</TabsTrigger>
                </TabsList>

                <TabsContent value="smart_events" className="space-y-4">
                  {smartFeedLoading && smartEvents.length === 0 ? (
                    <FeedSkeleton />
                  ) : smartEvents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      AI is looking for the best events for you...
                    </div>
                  ) : (
                    smartEvents.map(e => (
                      <Card 
                        key={e.id} 
                        className="overflow-hidden border-purple-200 dark:border-purple-900 shadow-sm hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setSelectedEvent(e)}
                      >
                        <div className="h-32 bg-muted relative">
                          {e.image_url && <img src={e.image_url} className="w-full h-full object-cover" />}
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md flex gap-1 font-bold items-center">
                            <Sparkles className="w-3 h-3 text-yellow-400" /> {(e.match_score || 95).toFixed(0)}% Match
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-bold truncate text-lg">{e.title}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            {/* ✅ FIXED: Reduced icon size */}
                            <MapPin className="w-3 h-3" /> {e.location}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="smart_communities" className="space-y-4">
                  {smartFeedLoading && smartCommunities.length === 0 ? (
                    <FeedSkeleton />
                  ) : smartCommunities.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      AI is looking for the best communities for you...
                    </div>
                  ) : (
                    smartCommunities.map(c => (
                      <Card 
                        key={c.id} 
                        className="overflow-hidden border-purple-200 dark:border-purple-900 shadow-sm hover:shadow-md transition-all cursor-pointer"
                        onClick={() => setSelectedCommunity(c)}
                      >
                        <div className="h-24 bg-muted relative">
                          {c.cover_url && <img src={c.cover_url} className="w-full h-full object-cover opacity-80" />}
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md flex gap-1 font-bold items-center">
                            <Sparkles className="w-3 h-3 text-yellow-400" /> {(c.match_score || 90).toFixed(0)}% Match
                          </div>
                          <div className="absolute -bottom-6 left-4">
                            <img 
                              src={c.avatar_url || '/default-avatar.png'} 
                              className="w-12 h-12 rounded-xl bg-background border-2 border-background object-cover shadow-md"
                            />
                          </div>
                        </div>
                        <CardContent className="p-4 pt-8">
                          <h3 className="font-bold truncate text-base">{c.name}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{c.description}</p>
                          <div className="flex items-center gap-1 mt-2 text-xs text-primary font-medium">
                            {/* ✅ FIXED: Reduced icon size */}
                            <Users className="w-3 h-3" /> {c.member_count} members
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      {selectedStory && <StoryViewer user={selectedStory} onClose={() => setSelectedStory(null)} />}
      
      <EventDetailModal event={selectedEvent} isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} onRSVP={handleRSVP} /> 
      <CommunityDetailModal community={selectedCommunity} isOpen={!!selectedCommunity} onClose={() => setSelectedCommunity(null)} onJoin={handleJoinCommunity} onOpen={() => navigate('/app/messages')} />
    </div>
  );
}
