import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Calendar, MapPin, X, Loader2, Plus, 
  Heart, Share2, Sparkles, Lock, RefreshCw, Check,
  Clock, Ticket, ExternalLink, Megaphone, MessageSquare,
MoreVertical, Trash2, Copy 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns"; 
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
  media_type?: 'image' | 'video' | null; 
}
interface Community { 
  id: string; 
  name: string; 
  member_count: number | null; 
  description: string | null; 
  avatar_url: string | null;
  cover_url?: string | null;  // ADDED: Support cover_url from database
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
  is_sponsored?: boolean; // [MODIFIED: Added is_sponsored]
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
             {/* [MODIFIED: Display Sponsored Badge in Modal] */}
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

            {/* [MODIFIED: Always show attendees] */}
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto p-0 overflow-hidden">
        {/* Cover Photo */}
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
          </div>
        )}
        
        <div className="p-6 space-y-4">
          {/* Title & Description */}
          <div>
            <h2 className="text-2xl font-bold mb-2">{community.name}</h2>
            {community.description && (
              <p className="text-muted-foreground">{community.description}</p>
            )}
          </div>

          {/* Community Stats */}
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

          {/* Action Buttons */}
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

// Then update the StoryViewer component:

function StoryViewer({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { user: currentUser } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [msg, setMsg] = useState("");
  const [showActions, setShowActions] = useState(false);  // ✅ NEW

  useEffect(() => {
    const load = async () => {
      const yesterday = new Date(Date.now() - 864e5).toISOString();
      const { data } = await supabase
        .from('stories')
        .select('id, content, created_at, author_id, media_url, media_type')
        .eq('author_id', user.id)
        .gte('created_at', yesterday)
        .order('created_at', { ascending: true });
      
      if (data) setStories(data);
      setLoading(false);
    };
    load();
  }, [user.id]);

  const current = stories[index];
  const isMyStory = currentUser?.id === user.id;  // ✅ Check if viewing own story
  
  const next = () => index < stories.length - 1 ? (setIndex(i => i + 1), setLiked(false)) : onClose();
  const prev = () => setIndex(i => Math.max(i - 1, 0));

  // ✅ NEW: Delete story function
  const handleDeleteStory = async () => {
    if (!current || !currentUser) return;
    
    const confirmed = window.confirm('Delete this story? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      // Delete from database
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', current.id)
        .eq('author_id', currentUser.id);  // Security: only delete own stories
      
      if (error) throw error;
      
      // Delete from storage if has media
      if (current.media_url) {
        const path = current.media_url.split('/').slice(-3).join('/');  // Extract path from URL
        await supabase.storage.from('chat-attachments').remove([path]);
      }
      
      toast.success('Story deleted');
      
      // If no more stories, close viewer
      if (stories.length === 1) {
        onClose();
      } else {
        // Remove from local state
        setStories(prev => prev.filter(s => s.id !== current.id));
        if (index >= stories.length - 1) setIndex(Math.max(0, index - 1));
      }
      
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete story');
    }
  };

  // ✅ NEW: Share to DM function
  const handleShareToDM = () => {
    toast.info('Share to DM - Coming soon!');
    // TODO: Navigate to messages with story link
    // navigate('/app/messages', { state: { shareStory: current.id } });
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <Loader2 className="text-white animate-spin" />
    </div>
  );
  
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center sm:p-4 animate-in fade-in duration-300">
      {/* Close button */}
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 z-50 text-white/80 hover:text-white"
      >
        <X className="w-8 h-8" />
      </button>
      
      {/* ✅ NEW: Actions menu (only for own stories) */}
      {isMyStory && (
        <button 
          onClick={() => setShowActions(!showActions)} 
          className="absolute top-6 right-20 z-50 text-white/80 hover:text-white"
        >
          <MoreVertical className="w-7 h-7" />
        </button>
      )}
      
      <div className="relative w-full h-full sm:max-w-md sm:h-[85vh] bg-black sm:rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl">
        {/* Progress bars */}
        <div className="absolute top-0 w-full z-20 flex gap-1 p-2">
          {stories.map((_, i) => (
            <div key={i} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div className={`h-full bg-white transition-all duration-300 ${i <= index ? 'w-full' : 'w-0'}`} />
            </div>
          ))}
        </div>
        
        {/* User header */}
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
        </div>
        
        {/* ✅ NEW: Actions dropdown */}
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
        
        {/* Main content area */}
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
          
          {/* Caption */}
          {current.media_url && current.content && (
            <div className="absolute bottom-20 left-0 right-0 px-6">
              <p className="text-white text-center text-sm bg-black/40 backdrop-blur-sm rounded-full py-2 px-4">
                {current.content}
              </p>
            </div>
          )}
        </div>
        
        {/* Bottom bar - Only show reply/reaction for other people's stories */}
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
                setLiked(!liked); 
                toast.success("Reaction sent ❤️"); 
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
        
        {/* ✅ NEW: View count for own stories */}
        {isMyStory && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
            <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2">
              <Users className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium">0 views</span>
            </div>
          </div>
        )}
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
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  
  const [preview, setPreview] = useState<{ file: File, url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      // 1. Profiles
      const { data: me } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (me) {
        setCurrentUserProfile({ id: me.id, display_name: me.display_name, avatar_url: me.avatar_url });
      }
      
      const yesterday = new Date();
yesterday.setHours(yesterday.getHours() - 24);

const { data: storyData } = await supabase
  .from('profiles')
  .select(`
    id, 
    display_name, 
    avatar_url, 
    stories:stories!author_id(id, created_at, content, media_url, media_type)
  `)
  .gte('stories.created_at', yesterday.toISOString())
  .order('stories.created_at', { ascending: false, foreignTable: 'stories' });

if (storyData) {
  // Only show profiles that have stories in the last 24 hours
  const usersWithStories = storyData
    .filter((p: any) => p.stories && p.stories.length > 0)
    .map((p: any) => ({
      id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url
    }));
  
  setStoryUsers(usersWithStories);
  console.log(`✅ Found ${usersWithStories.length} users with active stories`);
}

      // 2. Communities with membership status (use left join instead of inner)
      const { data: comms, error: commsError } = await supabase
        .from('communities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (commsError) {
        console.error("❌ Communities fetch error:", commsError);
      } else {
        console.log("🏛️ Communities fetched:", comms?.length);
      }
      
      if (comms) {
        // Fetch memberships separately to avoid inner join filtering
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
    const actualMemberCount = memberCountMap.get(c.id) || 0;  // ✅ Always accurate
    
    console.log(`✅ Community: "${c.name}" - Actual: ${actualMemberCount} - DB: ${c.member_count} - Joined: ${isMember}`);
    
    return {
      id: c.id,
      name: c.name,
      member_count: actualMemberCount,  // ✅ Use calculated count
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
      const { data: evts } = await supabase
        .from('events')
        .select('*')
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(20);
      
      if (evts) {
        // Check RSVP status for each event
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
        const attendeeCount = attendeeMap.get(e.id) || e.attendee_count || 0;  // FIXED: Use actual count
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
            attendee_count: attendeeCount,  // Use calculated count
            is_attending: isAttending,
            is_sponsored: e.is_sponsored || false
          };
        });
        setEvents(mappedEvents);
      }

      // 4. Premium & AI (Enhanced)
      // 1. Fetch Subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single();

      const prem = sub?.status === 'active';
      setIsPremium(prem);

      if (prem) {
        // 2. Get Location & Fetch AI Feed
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;

            try {
              const { data: ai, error } = await supabase.functions.invoke('generate-smart-feed', {
                body: {
                  user_id: user.id,
                  user_lat: latitude,
                  user_long: longitude,
                },
              });

              if (error) throw error;

              if (ai) {
                // FIX: Removed 'Event[]' type to avoid collision with global DOM Event
                // You can use 'any[]' or import your specific type (e.g., AppEvent[])
                const formatted = ai.map((item: any) => ({
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
                
                setSmartFeed(formatted);
              }
            } catch (err) {
              console.error('AI Feed Error:', err);
            } finally {
              // FIX: Stop loading ONLY after the async AI work is done
              setLoading(false);
            }
          },
          (err) => {
            console.warn('Location denied, falling back to basic AI', err);
            // FIX: Ensure loading stops even if location is denied
            setLoading(false);
          }
        );
      } else {
        // FIX: If not premium, stop loading immediately
        setLoading(false);
      }
    };

    init();
  }, [user]);

  const handleUpload = async () => {
  if (!preview || !user) return;
  setUploading(true);
  
  try {
    // 1. Upload media to storage
    const ext = preview.file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('stories')
      .upload(path, preview.file);
    
    if (uploadError) throw uploadError;
    
    // 2. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('stories')
      .getPublicUrl(path);
    
    // 3. Create story record with media URL
    const { error: insertError } = await supabase
      .from('stories')
      .insert({ 
        author_id: user.id, 
        content: caption || null,
        media_url: publicUrl,  // ✅ Store media URL
        media_type: preview.file.type.startsWith('video') ? 'video' : 'image'
      });
    
    if (insertError) throw insertError;
    
    toast.success("Story posted! 📸");
    setPreview(null);
    setCaption("");
    
    // Refresh stories without full page reload
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    
    const { data: updatedStories } = await supabase
      .from('profiles')
      .select(`
        id, display_name, avatar_url, 
        stories:stories!author_id(id, created_at, content, media_url, media_type)
      `)
      .gte('stories.created_at', yesterday.toISOString());
    
    if (updatedStories) {
      const usersWithStories = updatedStories
        .filter((p: any) => p.stories && p.stories.length > 0)
        .map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url
        }));
      setStoryUsers(usersWithStories);
    }
    
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
    
    // FIXED: Increment member count in database
    const { error: incrementError } = await supabase.rpc('increment_community_members', { 
      community_id: communityId 
    });
    
    if (incrementError) {
      console.warn("⚠️ Failed to increment count:", incrementError);
    }
    
    toast.success("Joined community!");
      
      // Update local state
      setCommunities(prev => prev.map(c => 
      c.id === communityId 
        ? { 
            ...c, 
            is_member: true, 
            my_role: 'member', 
            member_count: (c.member_count || 0) + 1  // Properly increment
          }
        : c
    ));
    
    console.log("✅ Successfully joined community");
      } catch (e: any) {
        console.error("❌ Join community error:", e);
        toast.error(e.message || "Failed to join");
      }
    };
    
    declare global {
      interface Window {
        FlutterwaveCheckout?: (options: any) => void;
      }
    } 

  const FLUTTERWAVE_PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;

  const loadFlutterwaveScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById('flutterwave-script')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'flutterwave-script';
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
      document.body.appendChild(script);
    });
  };
  
  useEffect(() => {
  if (!FLUTTERWAVE_PUBLIC_KEY) return;
  
  loadFlutterwaveScript()
    .then(() => setScriptLoaded(true))
    .catch(() => toast.error('Payment system unavailable'));
}, [FLUTTERWAVE_PUBLIC_KEY]);
  
  const initiateFlutterwavePayment = async (paymentData: {
    amount: number;
    currency: string;
    email: string;
    name: string;
    phone: string;
    tx_ref: string;
    event_id: string;
    event_title: string;
    user_id: string;
  }) => {
    try {
      if (!scriptLoaded || !FLUTTERWAVE_PUBLIC_KEY) {
        throw new Error('Payment system not ready');
      }
  
      console.log("🚀 Initiating Flutterwave payment for event...");
      
      // Store pending transaction BEFORE payment
      const { error: transactionError } = await supabase.from('transactions').insert({
        user_id: paymentData.user_id,
        amount: paymentData.amount,
        type: 'purchase',
        status: 'pending',
        description: `Event ticket: ${paymentData.event_title}`,
        reference: paymentData.tx_ref,
        related_id: paymentData.event_id
      });
      
      if (transactionError) {
        console.error("❌ Transaction creation error:", transactionError);
        throw transactionError;
      }
  
      // Configure Flutterwave payment
      const config = {
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: paymentData.tx_ref,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_options: "card, banktransfer, ussd",
        customer: {
          email: paymentData.email,
          name: paymentData.name,
          phone_number: paymentData.phone || '',
        },
        customizations: {
          title: "Event Ticket Purchase",
          description: paymentData.event_title,
          logo: "https://try.usecorridor.xyz/ahmia/logo.png",
        },
        callback: async function(response: any) {
          console.log("💳 Payment response:", response);
          
          if (response.status === "successful" || response.status === "completed") {
            const toastId = toast.loading("Confirming your ticket purchase...");
            
            try {
              // Verify the transaction with your backend
              const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-flutterwave-payment', {
                body: { 
                  transaction_id: response.transaction_id,
                  tx_ref: paymentData.tx_ref 
                }
              });
              
              if (verifyError) throw verifyError;
              
              // Create event RSVP after successful payment
              const { error: rsvpError } = await supabase
                .from('event_attendees')
                .insert({
                  event_id: paymentData.event_id,
                  user_id: paymentData.user_id,
                  status: 'confirmed'
                });
              
              if (rsvpError) throw rsvpError;
              
              // Increment attendee count
              await supabase.rpc('increment_event_attendees', { 
                event_id: paymentData.event_id 
              });
              
              // Update transaction status to completed
              await supabase
                .from('transactions')
                .update({ 
                  status: 'completed',
                  flutterwave_transaction_id: response.transaction_id
                })
                .eq('reference', paymentData.tx_ref);
              
              // Update local state
              setEvents(prev => prev.map(e => 
                e.id === paymentData.event_id 
                  ? { 
                      ...e, 
                      is_attending: true,
                      attendee_count: (e.attendee_count || 0) + 1
                    }
                  : e
              ));
              
              setSmartFeed(prev => prev.map(e => 
                e.id === paymentData.event_id 
                  ? { 
                      ...e, 
                      is_attending: true,
                      attendee_count: (e.attendee_count || 0) + 1
                    }
                  : e
              ));
              
              toast.success("Ticket purchased successfully! 🎉", { id: toastId });
              console.log("✅ Event RSVP confirmed after payment");
              
            } catch (error: any) {
              console.error("❌ Post-payment error:", error);
              toast.error("Payment received but confirmation failed. Contact support.", { id: toastId });
              
              // Update transaction to completed anyway (payment was successful)
              await supabase
                .from('transactions')
                .update({ 
                  status: 'completed',
                  flutterwave_transaction_id: response.transaction_id
                })
                .eq('reference', paymentData.tx_ref);
            }
          } else {
            toast.error("Payment was not successful");
            
            // Update transaction status to failed
            await supabase
              .from('transactions')
              .update({ status: 'failed' })
              .eq('reference', paymentData.tx_ref);
          }
        },
        onclose: function() {
          console.log("Payment modal closed");
        }
      };
  
      // Launch Flutterwave payment modal
      if (window.FlutterwaveCheckout) {
        window.FlutterwaveCheckout(config);
        console.log("✅ Payment modal opened");
      } else {
        throw new Error("Flutterwave checkout not available");
      }
      
    } catch (error: any) {
      console.error("❌ Payment initiation error:", error);
      toast.error(error.message || "Failed to initiate payment");
      
      // Update transaction to failed
      await supabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('reference', paymentData.tx_ref);
      
      throw error;
    }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    
    try {
      const event = events.find(e => e.id === eventId) || smartFeed.find(e => e.id === eventId);
      console.log("🎟️ RSVP for event:", eventId, "- Currently attending:", event?.is_attending, "- Price:", event?.price);
      
      if (event?.is_attending) {
        // Cancel RSVP (no refund for now)
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
        
        // Update local state
        setEvents(prev => prev.map(e => 
          e.id === eventId 
            ? { 
                ...e, 
                is_attending: false,
                attendee_count: (e.attendee_count || 0) - 1
              }
            : e
        ));
        
        setSmartFeed(prev => prev.map(e => 
          e.id === eventId 
            ? { 
                ...e, 
                is_attending: false,
                attendee_count: (e.attendee_count || 0) - 1
              }
            : e
        ));
      } else {
        // FIXED: Check if event requires payment
        if (event?.price && event.price > 0) {
          console.log("💰 Paid event detected - Price:", event.price);
          
          // Get user profile for payment details
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, display_name, phone')
            .eq('user_id', user.id)
            .single();
          
          if (!profile) {
            toast.error("Unable to load your profile. Please try again.");
            return;
          }
          
          // Prepare payment data
          const paymentData = {
            amount: event.price,
            currency: 'NGN', // Change to your currency
            email: profile.email || user.email || '',
            name: profile.display_name || 'User',
            phone: profile.phone || '',
            tx_ref: `event_${eventId}_${Date.now()}`,
            event_id: eventId,
            event_title: event.title,
            user_id: user.id
          };
          
          console.log("💳 Initiating payment with data:", { ...paymentData, amount: `₦${paymentData.amount}` });
          
          // Call Flutterwave payment function (RSVP happens in callback)
          await initiateFlutterwavePayment(paymentData);
          
          // Don't create RSVP here - it's handled in the payment callback
          return; // Exit early, don't update state until payment succeeds
          
        } else {
        
          // Free event - Create RSVP immediately
          console.log("🎫 Free event - Creating RSVP...");
          
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
          
          toast.success("You're going! 🎉");
          console.log("✅ Free RSVP confirmed");
          
          // Update local state
          setEvents(prev => prev.map(e => 
            e.id === eventId 
              ? { 
                  ...e, 
                  is_attending: true,
                  attendee_count: (e.attendee_count || 0) + 1
                }
              : e
          ));
          
          setSmartFeed(prev => prev.map(e => 
            e.id === eventId 
              ? { 
                  ...e, 
                  is_attending: true,
                  attendee_count: (e.attendee_count || 0) + 1
                }
              : e
          ));
        }
      }
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
      {(() => {
        // Check if current user has stories
        const myStory = storyUsers.find(u => u.id === user?.id);
        
        return (
          <>
            {/* Show user's own story OR add button */}
            {myStory ? (
              // ✅ User has stories - show their story with gradient ring
              <div 
                className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0 group" 
                onClick={() => setSelectedStory(myStory)}
              >
                <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 group-hover:scale-105 transition-transform shadow-sm">
                  <img 
                    src={myStory.avatar_url || '/default-avatar.png'} 
                    className="w-full h-full rounded-full object-cover border-2 border-background" 
                    alt="Your story"
                  />
                </div>
                <span className="text-xs font-bold max-w-[70px] truncate">Your Story</span>
              </div>
            ) : (
              // ✅ No stories - show add button
              <div 
                className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group" 
                onClick={() => fileRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileRef} 
                  className="hidden" 
                  accept="image/*,video/*" 
                  onChange={(e) => e.target.files?.[0] && setPreview({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) })} 
                />
                <div className="w-16 h-16 rounded-full p-[2px] border-2 border-dashed border-muted-foreground/30 relative group-hover:border-primary transition-colors">
                  <img 
                    src={currentUserProfile?.avatar_url || '/default-avatar.png'} 
                    className="w-full h-full rounded-full object-cover opacity-50" 
                    alt="Add story"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-full">
                    <Plus className="w-6 h-6 text-primary drop-shadow-sm" />
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Add Story</span>
              </div>
            )}
            
            {/* Other users' stories */}
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
          </>
        );
      })()}
    </div>
  )}
</div>
      
            <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
  <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto bg-background/95 backdrop-blur-xl border-0">
    <DialogHeader>
      <DialogTitle>Create Story</DialogTitle>
    </DialogHeader>
    
    {/* ✅ FIXED: Reduced height to prevent overflow */}
    <div className="h-[40vh] max-h-[400px] min-h-[300px] bg-black/10 rounded-xl overflow-hidden flex items-center justify-center relative border">
      {preview?.file.type.startsWith('video') ? (
        <video 
          src={preview.url} 
          controls 
          className="max-h-full max-w-full object-contain" 
        />
      ) : (
        <img 
          src={preview?.url} 
          className="max-h-full max-w-full object-contain" 
          alt="Preview"
        />
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
      <div className="text-xs text-muted-foreground text-right">
        {caption.length}/150
      </div>
      
      <DialogFooter className="gap-2">
        <Button 
          variant="ghost" 
          onClick={() => setPreview(null)}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleUpload} 
          disabled={uploading} 
          className="gradient-primary text-white"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Share to Story
            </>
          )}
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
            <TabsTrigger value="foryou" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg"><Sparkles className="w-3 h-3 mr-1" /> For You</TabsTrigger>
          </TabsList>

          {/* Communities */}
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
          <Button 
            size="sm" 
            variant={c.is_member ? "outline" : "secondary"}
            className="rounded-full px-4"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCommunity(c);
            }}
          >
            View
          </Button>
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
                         {/* [MODIFIED: Added Sponsored Badge] */}
                        {e.is_sponsored && (
                          <Badge variant="outline" className="text-[10px] h-5 border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 px-1.5">
                            Sponsored
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <MapPin className="w-3.5 h-3.5" /> 
                        <span className="truncate">{e.location}</span>
                      </div>
                      {/* [MODIFIED: Ensure attendee count is always visible] */}
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
                    {e.image_url && <img src={e.image_url} className="w-full h-full object-cover" />}
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

      <CommunityDetailModal 
  community={selectedCommunity}
  isOpen={!!selectedCommunity}
  onClose={() => setSelectedCommunity(null)}
  onJoin={handleJoinCommunity}
  onOpen={() => navigate('/app/messages')}
/>
    </div>
  );
}
