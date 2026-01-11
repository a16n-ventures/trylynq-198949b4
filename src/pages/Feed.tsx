import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Heart, MessageCircle, Share2, MapPin, Calendar, Users, Plus, 
  Image as ImageIcon, Video, X, Loader2, MoreVertical, Trash2, Edit2, Repeat, Send,
  UserPlus, Check, Search, SlidersHorizontal, Sparkles, Filter, Ticket, Megaphone, Clock, Copy,
  MessageSquare, Eye, Type, CloudUpload
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow, isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';

// --- TYPES ---
interface Profile { id: string; display_name: string | null; avatar_url: string | null; user_id?: string; }
interface Story { 
  id: string; 
  content: string | null; 
  created_at: string; 
  author_id: string | null;
  media_url?: string | null; 
  media_type?: 'image' | 'video' | string | null; 
  view_count?: number;
}
type ProfileWithStoryInner = { id: string; display_name: string | null; avatar_url: string | null; user_id: string; stories: Story[]; };

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url?: string;
  post_type: 'status' | 'image' | 'video' | 'event' | 'repost';
  likes_count: number;
  comments_count: number;
  location?: string;
  created_at: string;
  profiles: { display_name: string; avatar_url: string; user_id: string; };
  is_liked_by_user?: boolean;
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

// --- SMART VERIFIED BADGE ---
const VerifiedBadge = ({ userId }: { userId?: string }) => {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const checkStatus = async () => {
        const { data: pf } = await supabase.from('premium_features').select('is_active').eq('user_id', userId).eq('is_active', true).gt('expires_at', new Date().toISOString()).maybeSingle();
        const { data: sub } = await supabase.from('subscriptions').select('status').eq('user_id', userId).eq('status', 'active').maybeSingle();
        if (pf || sub) setIsPremium(true);
    };
    checkStatus();
  }, [userId]);

  if (!isPremium) return null;

  return (
    <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1" viewBox="0 0 22 22" fill="currentColor">
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
};

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

// --- COMMUNITY DETAIL MODAL ---
function CommunityDetailModal({ 
  community, 
  isOpen, 
  onClose, 
  onJoin,
  onOpen 
}: {
  community: Community | null;
  isOpen: boolean;
  onClose: () => void;
  onJoin: (communityId: string) => void;
  onOpen: () => void;
}) {
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

// --- COMMENT ITEM UI ---
interface CommentItemUIProps {
  comment: any;
  currentUserId?: string;
  isLiked: boolean;
  postId: string;
  onLike: (commentId: string) => void;
  onReply: (commentId: string, authorName: string) => void;
  onEdit: (commentId: string, newContent: string) => void;
  onDelete: (commentId: string, postId: string) => void;
  isReply: boolean;
}

function CommentItemUI({ comment, currentUserId, isLiked, postId, onLike, onReply, onEdit, onDelete, isReply }: CommentItemUIProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  
  const isOwner = currentUserId === comment.user_id;
  
  const handleSaveEdit = () => {
    if (editText.trim()) {
      onEdit(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className="flex gap-3 group">
      <Avatar className={isReply ? "w-6 h-6" : "w-8 h-8"}>
        <AvatarImage src={comment.profiles?.avatar_url} />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className={`${isReply ? 'bg-muted/30 p-2 rounded-lg rounded-tl-none' : 'bg-muted/50 p-3 rounded-xl rounded-tl-none'} relative`}>
          <div className="flex items-start justify-between gap-2">
            <p className={`${isReply ? 'text-xs' : 'text-xs'} font-bold mb-1`}>{comment.profiles?.display_name}</p>
            {isOwner && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={() => { setIsEditing(true); setEditText(comment.content); }}>
                    <Edit2 className="w-3 h-3 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(comment.id, postId)} className="text-destructive">
                    <Trash2 className="w-3 h-3 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              <Input 
                value={editText} 
                onChange={e => setEditText(e.target.value)} 
                className="text-sm h-8"
                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
              />
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button size="sm" className="h-6 text-xs" onClick={handleSaveEdit}>Save</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm">{comment.content}</p>
          )}
          {comment.updated_at && !isEditing && (
            <span className="text-[10px] text-muted-foreground italic ml-1">(edited)</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`text-xs ${isReply ? 'h-5 px-1' : 'h-6 px-2'} ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
            onClick={() => onLike(comment.id)}
          >
            <Heart className={`w-3 h-3 mr-1 ${isLiked ? 'fill-red-500' : ''}`} />
            {comment.likes_count || 0}
          </Button>
          {!isReply && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground h-6 px-2"
              onClick={() => onReply(comment.id, comment.profiles?.display_name || 'User')}
            >
              Reply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- STORY VIEWER ---
function StoryViewer({ user, onClose, onStoryChange }: { user: Profile; onClose: () => void; onStoryChange?: () => void }) {
  const { user: currentUser } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [msg, setMsg] = useState("");
  const [showActions, setShowActions] = useState(false); 
  const [viewCount, setViewCount] = useState(0);
  const [incomingHearts, setIncomingHearts] = useState<{ id: number, left: number }[]>([]);

  // Check verified status
  const { data: isVerified } = useQuery({
    queryKey: ['story-author-premium', user.id],
    queryFn: async () => {
      // Handle potential ID mismatch (some profiles might use id vs user_id)
      const targetId = user.user_id || user.id;
      if (!targetId) return false;
      
      const { data: pf } = await supabase.from('premium_features').select('is_active').eq('user_id', targetId).eq('is_active', true).gt('expires_at', new Date().toISOString()).maybeSingle();
      const { data: sub } = await supabase.from('subscriptions').select('status').eq('user_id', targetId).eq('status', 'active').maybeSingle();
      return !!pf || !!sub;
    },
    enabled: !!(user.id || user.user_id)
  });

  useEffect(() => {
    const load = async () => {
      const targetId = user.user_id || user.id;
      const yesterday = new Date(Date.now() - 864e5).toISOString();
      const { data } = await supabase
        .from('stories')
        .select('id, content, created_at, author_id, media_url, media_type, view_count')
        .eq('author_id', targetId) 
        .gte('created_at', yesterday)
        .order('created_at', { ascending: true });
      
      if (data && data.length > 0) {
        setStories(data);
        setViewCount(data[0].view_count || 0);
      } else {
        onClose(); 
      }
      setLoading(false);
    };
    load();
  }, [user.id]);

  const current = stories[index];
  const isMyStory = currentUser?.id === (user.user_id || user.id); 
  
  // Realtime Logic
  useEffect(() => {
    if (!current || !currentUser) return;

    if (!isMyStory) {
      const viewKey = `story-view-${current.id}-${currentUser.id}`;
      if (!sessionStorage.getItem(viewKey)) {
        const recordView = async () => {
          await supabase.rpc('increment_story_view', { story_id: current.id, viewer_id: currentUser.id });
          sessionStorage.setItem(viewKey, 'true');
        };
        recordView();
      }
    }

    const channel = supabase.channel(`story-${current.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stories', filter: `id=eq.${current.id}` }, (payload: any) => {
          if (payload.new.view_count !== undefined) setViewCount(payload.new.view_count);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_likes', filter: `story_id=eq.${current.id}` }, (payload) => {
          if (payload.new.user_id !== currentUser.id) {
             const id = Date.now();
             setIncomingHearts(prev => [...prev, { id, left: Math.random() * 80 + 10 }]);
             setTimeout(() => setIncomingHearts(prev => prev.filter(h => h.id !== id)), 2000);
          }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
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
    setIncomingHearts(prev => [...prev, { id: Date.now(), left: 50 }]);
    await supabase.from('story_likes').insert({ story_id: current.id, user_id: currentUser.id });
  };

  const handleDeleteStory = async () => {
    if (!current || !currentUser) return;
    if (!confirm('Delete this story?')) return;
    
    await supabase.from('stories').delete().eq('id', current.id).eq('author_id', currentUser.id);
    if (current.media_url) {
      const path = current.media_url.split('/').slice(-3).join('/');
      await supabase.storage.from('stories').remove([path]);
    }
    toast.success('Story deleted');
    
    if (stories.length === 1) {
      onClose();
      onStoryChange?.();
    } else {
      const newStories = stories.filter(s => s.id !== current.id);
      setStories(newStories);
      if (index >= newStories.length) setIndex(Math.max(0, newStories.length - 1));
      onStoryChange?.(); 
    }
  };

  const handleShareToDM = () => toast.info('Share to DM - Coming soon!');

  if (loading || !current) return null;

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
            <img src={user.avatar_url || '/default-avatar.png'} className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" />
            <div className="flex-1">
              <span className="text-white font-bold text-sm drop-shadow-md flex items-center gap-1">
                {isMyStory ? 'Your Story' : user.display_name}
                {isVerified && !isMyStory && <VerifiedBadge userId={user.user_id || user.id} />}
              </span>
              <span className="text-white/70 text-xs block">{formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}</span>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-2"><X className="w-6 h-6" /></button>
          </div>
          
          {isMyStory && (
            <button onClick={() => setShowActions(!showActions)} className="absolute top-6 right-16 z-50 text-white/80 hover:text-white p-2">
              <MoreVertical className="w-6 h-6" />
            </button>
          )}

          {isMyStory && showActions && (
            <div className="absolute top-20 right-4 z-30 bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <button onClick={handleDeleteStory} className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-3 transition-colors">
                <Trash2 className="w-4 h-4" /> <span className="text-sm font-medium">Delete Story</span>
              </button>
              <button onClick={() => { navigator.clipboard.writeText(current.media_url || ''); toast.success('Copied!'); }} className="w-full px-4 py-3 text-left text-white hover:bg-white/10 flex items-center gap-3 transition-colors">
                <Copy className="w-4 h-4" /> <span className="text-sm font-medium">Copy</span>
              </button>
            </div>
          )}

          <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
            {incomingHearts.map((h) => (
              <div key={h.id} className="absolute bottom-20 text-4xl animate-float-up" style={{ left: `${h.left}%`, transition: 'transform 2s ease-out' }}>❤️</div>
            ))}
          </div>
          
          <div className="flex-1 flex items-center justify-center bg-black relative" onClick={next}>
            <div className="w-full h-full flex items-center justify-center p-4">
              {current.media_url ? (
                current.media_type === 'video' ? (
                  <video src={current.media_url} className="max-w-full max-h-full object-contain rounded-lg" autoPlay loop muted playsInline />
                ) : (
                  <img src={current.media_url} className="max-w-full max-h-full object-contain rounded-lg" alt="Story" />
                )
              ) : (
                <p className="text-white text-xl text-center px-8 leading-relaxed">{current.content || ''}</p>
              )}
            </div>
            {current.media_url && current.content && (
              <div className="absolute bottom-20 left-0 right-0 px-6">
                <p className="text-white text-center text-sm bg-black/40 backdrop-blur-sm rounded-full py-2 px-4">{current.content}</p>
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
              <Button size="icon" variant="ghost" className="text-white rounded-full hover:bg-white/10" onClick={(e) => { e.stopPropagation(); handleLike(); }}>
                <Heart className={`w-7 h-7 transition-transform active:scale-125 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
              <Button size="icon" variant="ghost" className="text-white rounded-full hover:bg-white/10" onClick={(e) => { e.stopPropagation(); handleShareToDM(); }}>
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

// --- SOCIAL FEED COMPONENT ---
const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [postText, setPostText] = useState('');
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Tagging
  const [friends, setFriends] = useState<any[]>([]);
  const [showTagList, setShowTagList] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  
  // Connection State
  const [myFriends, setMyFriends] = useState<string[]>([]);
  const [sentRequests, setSentRequests] = useState<string[]>([]);

  // Story States
  const [storyUsers, setStoryUsers] = useState<ProfileWithStoryInner[]>([]);
  const [selectedStory, setSelectedStory] = useState<Profile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [storiesLoading, setStoriesLoading] = useState(true);
  
  // Post Upload State
  const [postMedia, setPostMedia] = useState<{ file: File, url: string, type: 'image' | 'video' } | null>(null);
  const [uploadingPost, setUploadingPost] = useState(false);
  const [locationData, setLocationData] = useState<string | null>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Post State
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState("");

  // Story Upload State
  const [storyPreview, setStoryPreview] = useState<{ file: File, url: string } | null>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [uploadingStory, setUploadingStory] = useState(false);
  const storyFileRef = useRef<HTMLInputElement>(null);

  // Creation Modal State (Unified)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'story' | 'post' | 'photo' | 'video'>('post');
  const unifiedFileRef = useRef<HTMLInputElement>(null);

  // Comment & Share States
  const [activeCommentPost, setActiveCommentPost] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [postComments, setPostComments] = useState<any[]>([]);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  
  // Profile Preview
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);

  // Search & Spotlight States
  const [searchQuery, setSearchQuery] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  
  // Modal States
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchPosts();
    fetchStories();
    fetchRelationships();
    fetchSpotlightData();
    
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCurrentUserProfile(data); });

    const fetchMyFriends = async () => {
        const { data } = await supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq('status', 'accepted');
        if (data) {
            const friendIds = data.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);
            setMyFriends(friendIds);
            const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', friendIds);
            setFriends(profiles || []);
        }
    };
    fetchMyFriends();

    const channel = supabase.channel('social-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, () => {
         fetchPosts(); 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRelationships = async () => {
      if(!user) return;
      const {data: reqs} = await supabase.from('friendships').select('addressee_id').eq('requester_id', user.id).eq('status', 'pending');
      if(reqs) setSentRequests(reqs.map(r => r.addressee_id));
  };

  const fetchStories = async () => {
    if (!user) return;
    setStoriesLoading(true);
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const { data: storyData } = await supabase.from('stories').select('*').gte('created_at', yesterday.toISOString()).order('created_at', { ascending: false });

    if (storyData && storyData.length > 0) {
      const authorIds = Array.from(new Set(storyData.map((s: any) => s.author_id)));
      const { data: profiles } = await supabase.from('profiles').select('id, user_id, display_name, avatar_url').in('user_id', authorIds); 
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
      const storyMap = new Map<string, any>();
      
      storyData.forEach((story: any) => {
        const profile = profileMap.get(story.author_id);
        if (!profile) return;
        if (!storyMap.has(profile.user_id)) {
          storyMap.set(profile.user_id, { id: profile.user_id, user_id: profile.user_id, display_name: profile.display_name, avatar_url: profile.avatar_url, stories: [] });
        }
        storyMap.get(profile.user_id).stories.push(story);
      });
      setStoryUsers(Array.from(storyMap.values()));
    } else {
      setStoryUsers([]);
    }
    setStoriesLoading(false);
  };

  const fetchPosts = async () => {
    const { data: posts, error } = await supabase
      .from('social_posts')
      .select(`*, profiles (display_name, avatar_url, user_id), post_likes (user_id)`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && posts) {
      const formattedPosts = posts.map((p: any) => ({
          ...p,
          is_liked_by_user: p.post_likes && p.post_likes.some((l: any) => l.user_id === user?.id)
      }));
      setFeedPosts(formattedPosts as Post[]);
    }
    setLoading(false);
  };

  const fetchSpotlightData = async () => {
    // Fetch communities sorted by latest created
    const { data: comms } = await supabase
      .from('communities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (comms) {
      // Check membership status
      if (user) {
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', user.id);
        
        const membershipMap = new Map(memberships?.map(m => [m.community_id, m.role]) || []);
        
        setCommunities(comms.map(c => ({ 
          ...c, 
          avatar_url: c.cover_url || null,
          is_member: membershipMap.has(c.id),
          my_role: membershipMap.get(c.id) || null
        })));
      } else {
        setCommunities(comms.map(c => ({ ...c, avatar_url: c.cover_url || null })));
      }
    }

    // Fetch events sorted by latest created
    const { data: evts } = await supabase
      .from('events')
      .select('*')
      .gt('start_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (evts && user) {
      const eventIds = evts.map(e => e.id);
      const { data: rsvps } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', user.id)
        .in('event_id', eventIds);
      
      const rsvpSet = new Set(rsvps?.map(r => r.event_id) || []);
      setEvents(evts.map(e => ({ ...e, is_attending: rsvpSet.has(e.id) })));
    } else if (evts) {
      setEvents(evts);
    }
  };

  // --- HELPER TO OPEN MODAL ---
  const openCreateModal = (type: 'story' | 'post' | 'photo' | 'video') => {
    setCreateType(type);
    setCreateModalOpen(true);
    // Clear states when opening
    setPostText('');
    setPostMedia(null);
    setLocationData(null);
    setStoryCaption('');
    setStoryPreview(null);
  };

  // --- HANDLERS ---
  const handleStoryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setStoryPreview({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) });
  };

  const handleStoryUpload = async () => {
    if (!storyPreview || !user) return;
    setUploadingStory(true);
    try {
      const ext = storyPreview.file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      await supabase.storage.from('stories').upload(path, storyPreview.file);
      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);
      
      await supabase.from('stories').insert({ 
        author_id: user.id, 
        content: storyCaption || null,
        media_url: publicUrl,
        media_type: storyPreview.file.type.startsWith('video') ? 'video' : 'image'
      });
      
      toast.success("Story posted! 📸");
      setStoryPreview(null);
      setStoryCaption("");
      setCreateModalOpen(false); // Close unified modal
      await fetchStories();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingStory(false);
    }
  };

  const handlePostMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const type = file.type.startsWith('video') ? 'video' : 'image';
      setPostMedia({ file, url: URL.createObjectURL(file), type });
    }
  };

  // UNIFIED MEDIA HANDLER
  const handleUnifiedFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';

    if (createType === 'story') {
      setStoryPreview({ file, url });
    } else {
      setPostMedia({ file, url, type });
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setPostText(val);
      const lastWord = val.split(' ').pop();
      if(lastWord && lastWord.startsWith('@')) {
          setTagQuery(lastWord.substring(1));
          setShowTagList(true);
      } else {
          setShowTagList(false);
      }
  };

  const addTag = (username: string) => {
      const words = postText.split(' ');
      words.pop();
      setPostText(words.join(' ') + ` @${username} `);
      setShowTagList(false);
  };

  const getLocation = () => {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              async (pos) => {
                  const { latitude, longitude } = pos.coords;
                  try {
                      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                      const data = await response.json();
                      const address = data.address;
                      const city = address.city || address.town || address.village || address.hamlet;
                      const country = address.country;
                      const locationName = city && country ? `${city}, ${country}` : data.display_name.split(',')[0]; 
                      setLocationData(locationName);
                      toast.success("Location added");
                  } catch (error) {
                      setLocationData(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                      toast.success("Location coordinates added");
                  }
              },
              (err) => {
                  toast.error("Could not get location");
              }
          );
      } else {
          toast.error("Geolocation not supported");
      }
  };

  const handleCreatePost = async () => {
    if (!postText.trim() && !postMedia) {
      toast.error('Please write something or add media');
      return;
    }
    setUploadingPost(true);

    try {
      let publicUrl = null;
      let postType = 'status';

      if (postMedia) {
        const ext = postMedia.file.name.split('.').pop();
        const path = `posts/${user?.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post_media').upload(path, postMedia.file);
        if (uploadError) throw uploadError;
        
        const res = supabase.storage.from('post_media').getPublicUrl(path);
        publicUrl = res.data.publicUrl;
        postType = postMedia.type;
      }

      const { error } = await supabase.from('social_posts').insert({
        user_id: user?.id,
        content: postText.trim(),
        post_type: postType,
        image_url: publicUrl,
        location: locationData 
      });

      if (error) throw error;

      toast.success('Post created!');
      setPostText('');
      setPostMedia(null);
      setLocationData(null);
      setCreateModalOpen(false); // Close unified modal
      fetchPosts();
    } catch (error: any) {
      toast.error('Failed to create post');
    } finally {
      setUploadingPost(false);
    }
  };

  // UNIFIED SUBMIT HANDLER
  const handleUnifiedSubmit = () => {
    if (createType === 'story') {
      handleStoryUpload();
    } else {
      // Validate media for Photo/Video types
      if (createType === 'photo' && (!postMedia || postMedia.type !== 'image')) {
        toast.error("Please select a photo");
        return;
      }
      if (createType === 'video' && (!postMedia || postMedia.type !== 'video')) {
        toast.error("Please select a video");
        return;
      }
      handleCreatePost();
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure?")) return;
    await supabase.from('social_posts').delete().eq('id', postId).eq('user_id', user?.id);
    setFeedPosts(prev => prev.filter(p => p.id !== postId));
    toast.success("Post deleted");
  };

  const openEditPost = (post: Post) => {
      setEditingPost(post);
      setEditContent(post.content);
  };

  const submitEditPost = async () => {
      if(!editingPost) return;
      const { error } = await supabase.from('social_posts').update({ content: editContent }).eq('id', editingPost.id);
      if(!error) {
          toast.success("Post updated");
          setEditingPost(null);
          fetchPosts();
      } else {
          toast.error("Failed to update post");
      }
  };

  const handleConnect = async (targetId: string) => {
      await supabase.from('friendships').insert({ requester_id: user?.id, addressee_id: targetId });
      setSentRequests(prev => [...prev, targetId]);
      toast.success("Request sent");
  };

  const handleLikePost = async (post: Post) => {
    const isLiked = post.is_liked_by_user;
    setFeedPosts(prev => prev.map(p => p.id === post.id ? { 
        ...p, 
        likes_count: isLiked ? p.likes_count - 1 : p.likes_count + 1,
        is_liked_by_user: !isLiked
    } : p));

    if (isLiked) {
        await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: user?.id });
        await supabase.rpc('decrement_post_likes', { post_id: post.id });
    } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: user?.id });
        await supabase.rpc('increment_post_likes', { post_id: post.id });
    }
  };

  const handleRepost = async (post: Post) => {
      const { error } = await supabase.from('social_posts').insert({
          user_id: user?.id,
          content: `Reposted from ${post.profiles.display_name}: \n\n${post.content}`,
          image_url: post.image_url,
          post_type: 'repost'
      });
      if(!error) toast.success("Reposted!");
  };

  const handleShareToDM = async (friendId: string) => {
      if(!sharePost || !user) return;
      await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: friendId,
          content: `Shared a post: ${window.location.origin}/post/${sharePost.id}`, 
      });
      setSharePost(null);
      toast.success("Sent to DM");
  };

  const openComments = async (postId: string) => {
    setActiveCommentPost(postId);
    setReplyingTo(null);
    setLikedComments(new Set());
    
    const { data, error } = await supabase
      .from('post_comments')
      .select('*, profiles(display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching comments:', error);
      setPostComments([]);
    } else {
      setPostComments(data || []);
      
      // Fetch user's liked comments
      if (user && data && data.length > 0) {
        const commentIds = data.map((c: any) => c.id);
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);
        
        if (likes) {
          setLikedComments(new Set(likes.map(l => l.comment_id)));
        }
      }
    }
  };

  const submitComment = async () => {
    if (!activeCommentPost || !commentText.trim() || !user) return;

    // Use local profile data instead of relying on a join (avoids RLS/join issues)
    const optimisticProfile = currentUserProfile || {
      display_name: 'You',
      avatar_url: null,
      user_id: user.id,
    };

    try {
      // 1) Simple insert (no join)
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: activeCommentPost,
          user_id: user.id,
          content: commentText.trim(),
          parent_id: replyingTo?.id || null,
        })
        .select('*')
        .single();

      if (error) throw error;

      // 2) Construct object expected by UI
      const newComment = {
        ...data,
        profiles: {
          display_name: optimisticProfile.display_name,
          avatar_url: optimisticProfile.avatar_url,
          user_id: user.id,
        },
      };

      // 3) Update counters + UI
      await supabase.rpc('increment_post_comments', { post_id: activeCommentPost });
      setPostComments((prev) => [...prev, newComment]);
      setFeedPosts((prev) =>
        prev.map((p) =>
          p.id === activeCommentPost
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );

      setCommentText('');
      setReplyingTo(null);
      toast.success('Comment posted!');
    } catch (err: any) {
      console.error('Comment failed:', err);
      toast.error(err?.message || 'Failed to post comment');
    }
  };

  const handleReply = (commentId: string, authorName: string) => {
    setReplyingTo({ id: commentId, name: authorName });
  };

  const handleEditComment = async (commentId: string, newContent: string) => {
    if (!user || !newContent.trim()) return;
    
    const { error } = await supabase
      .from('post_comments')
      .update({ content: newContent.trim(), updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id);
    
    if (error) {
      toast.error('Failed to update comment');
      return;
    }
    
    setPostComments(prev => prev.map(c => 
      c.id === commentId ? { ...c, content: newContent.trim(), updated_at: new Date().toISOString() } : c
    ));
    toast.success('Comment updated');
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!user || !confirm('Delete this comment?')) return;
    
    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);
    
    if (error) {
      toast.error('Failed to delete comment');
      return;
    }
    
    await supabase.rpc('decrement_post_comments', { post_id: postId });
    setPostComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId));
    setFeedPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, comments_count: Math.max((p.comments_count || 0) - 1, 0) } : p
    ));
    toast.success('Comment deleted');
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) return;
    
    const isLiked = likedComments.has(commentId);
    
    // Optimistic update
    setLikedComments(prev => {
      const next = new Set(prev);
      if (isLiked) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
    
    setPostComments(prev => prev.map(c => 
      c.id === commentId 
        ? { ...c, likes_count: (c.likes_count || 0) + (isLiked ? -1 : 1) }
        : c
    ));

    if (isLiked) {
      await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: user.id });
      await supabase.rpc('decrement_comment_likes', { p_comment_id: commentId });
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
      await supabase.rpc('increment_comment_likes', { p_comment_id: commentId });
    }
  };

  // Helper to organize comments into threads
  const getThreadedComments = () => {
    const topLevel = postComments.filter(c => !c.parent_id);
    const replies = postComments.filter(c => c.parent_id);
    
    return topLevel.map(comment => ({
      ...comment,
      replies: replies.filter(r => r.parent_id === comment.id)
    }));
  };

  // ✅ ADDED: Handlers for Modals
  const handleJoinCommunity = async (communityId: string) => {
    if (!user) return;
    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('community_members')
        .select('id')
        .eq('community_id', communityId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existing) {
        toast.info("You're already a member of this community!");
        setCommunities(prev => prev.map(c => 
          c.id === communityId ? { ...c, is_member: true, my_role: 'member' } : c
        ));
        return;
      }

      const { error } = await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: user.id,
        role: 'member'
      });
      if (error) throw error;
      
      await supabase.rpc('increment_community_members', { community_id: communityId });
      toast.success("Joined community!");
      
      setCommunities(prev => prev.map(c => 
        c.id === communityId 
          ? { ...c, is_member: true, my_role: 'member', member_count: (c.member_count || 0) + 1 }
          : c
      ));

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
      script.src = 'https://checkout.flutterwave.com/v3.js';
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
      
      const tx_ref = paymentData.tx_ref;
      
      // Record pending payment in payments table
      const { error: paymentError } = await supabase.from('payments').insert({
        user_id: paymentData.user_id,
        amount: paymentData.amount,
        currency: paymentData.currency || 'NGN',
        status: 'pending',
        tx_ref: tx_ref
      });
      
      if (paymentError) throw paymentError;
  
      const config = {
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: tx_ref,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_options: "card, banktransfer, ussd",
        customer: { email: paymentData.email, name: paymentData.name, phone_number: paymentData.phone || '' },
        customizations: { title: "Event Ticket Purchase", description: paymentData.event_title, logo: "https://try.usecorridor.xyz/ahmia/logo.png" },
        callback: async function(response: any) {
          if (response.status === "successful" || response.status === "completed") {
            const toastId = toast.loading("Confirming your ticket purchase...");
            try {
              const { error: verifyError } = await supabase.functions.invoke('verify-flutterwave-payment', {
                body: { transaction_id: response.transaction_id, tx_ref: tx_ref }
              });
              if (verifyError) throw verifyError;
              
              const { error: rsvpError } = await supabase.from('event_attendees').insert({
                event_id: paymentData.event_id, user_id: paymentData.user_id, status: 'confirmed'
              });
              if (rsvpError) throw rsvpError;
              
              await supabase.rpc('increment_event_attendees', { event_id: paymentData.event_id });
              await supabase.from('payments').update({ status: 'completed', flw_ref: response.transaction_id }).eq('tx_ref', tx_ref);
              
              const updateEvents = (list: Event[]) => list.map(e => e.id === paymentData.event_id ? { ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 } : e);
              setEvents(prev => updateEvents(prev));
              setEvents(prev => updateEvents(prev));

              toast.success("Ticket purchased successfully! 🎉", { id: toastId });
            } catch (error: any) {
              toast.error("Payment received but confirmation failed. Contact support.", { id: toastId });
              await supabase.from('payments').update({ status: 'completed', flw_ref: response.transaction_id }).eq('tx_ref', tx_ref);
            }
          } else {
            toast.error("Payment was not successful");
            await supabase.from('payments').update({ status: 'failed' }).eq('tx_ref', tx_ref);
          }
        },
        onclose: function() {}
      };
  
      if (window.FlutterwaveCheckout) window.FlutterwaveCheckout(config);
      else throw new Error("Flutterwave checkout not available");
      
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate payment");
      throw error;
    }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    try {
      const event = events.find(e => e.id === eventId);
      
      // Check if already attending
      const { data: existingRsvp } = await supabase
        .from('event_attendees')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (event?.is_attending || existingRsvp) {
        // Already attending - cancel RSVP
        const { error } = await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        if (error) throw error;
        await supabase.rpc('decrement_event_attendees', { event_id: eventId });
        toast.success("RSVP cancelled");
        
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_attending: false, attendee_count: Math.max((e.attendee_count || 0) - 1, 0) } : e));
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
          
          setEvents(prev => prev.map(e => e.id === eventId ? { ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 } : e));
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to RSVP");
    }
  };

  const filteredPosts = feedPosts.filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase()) || p.profiles.display_name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredCommunities = communities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container-mobile py-4 space-y-4">
        
        {/* STORY TRAY */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 pt-2">
          {storiesLoading ? (
            <div className="flex gap-4">
              {[1,2,3].map(i => <div key={i} className="w-16 h-16 bg-muted rounded-full animate-pulse flex-shrink-0" />)}
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {(() => {
                const myStory = storyUsers.find(u => u.user_id === user?.id || u.id === user?.id);
                return (
                  <div 
                    className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group"
                    onClick={() => myStory ? setSelectedStory(myStory) : openCreateModal('story')}
                  >
                    <div className={`w-16 h-16 rounded-full p-[3px] ${myStory ? 'bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400' : 'border-2 border-dashed border-muted-foreground/30'} relative`}>
                      <img src={currentUserProfile?.avatar_url || '/default-avatar.png'} className={`w-full h-full rounded-full object-cover ${myStory ? 'border-2 border-background' : 'opacity-50'}`} />
                      {!myStory && <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-full"><div className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1 border-2 border-background"><Plus className="w-3 h-3" /></div></div>}
                    </div>
                    <span className="text-xs font-bold max-w-[70px] truncate">Your Story</span>
                  </div>
                );
              })()}
              
              {storyUsers.filter(u => u.user_id !== user?.id && u.id !== user?.id).map(u => (
                <div key={u.user_id} className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => setSelectedStory(u)}>
                  <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-orange-500 to-purple-600">
                    <img src={u.avatar_url || '/default-avatar.png'} className="w-full h-full rounded-full object-cover border-2 border-background" />
                  </div>
                  <span className="text-xs font-medium max-w-[70px] truncate">{u.display_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Header Text */}
        <div className="pb-1">
          <h1 className="text-lg font-bold">Social Feed</h1>
          <p className="text-xs text-muted-foreground">What's happening around you</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
                placeholder="Search posts, communities, events..." 
                className="pl-9 pr-12 bg-muted/50 border-0 h-11 rounded-xl focus-visible:ring-1"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
            />
            <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-9 w-9 text-muted-foreground hover:text-primary">
                <SlidersHorizontal className="w-4 h-4" />
            </Button>
        </div>

        {/* MAIN TABS */}
        <Tabs defaultValue="feed" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl mb-4">
                <TabsTrigger value="feed" className="rounded-lg">Feed</TabsTrigger>
                <TabsTrigger value="spotlight" className="rounded-lg">Spotlight</TabsTrigger>
            </TabsList>

            {/* FEED CONTENT */}
            <TabsContent value="feed" className="space-y-4">
                {/* Simplified Post Trigger */}
                <Card className="border-0 shadow-sm bg-card/50 cursor-pointer hover:bg-card/80 transition-colors" onClick={() => openCreateModal('post')}>
                  <CardContent className="p-4 flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={currentUserProfile?.avatar_url || undefined} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 h-10 bg-muted/50 rounded-full flex items-center px-4 text-muted-foreground text-sm">
                        What's on your mind?
                      </div>
                      <Button size="icon" variant="ghost" className="text-green-500"><ImageIcon className="w-5 h-5" /></Button>
                  </CardContent>
                </Card>

                {/* Posts List */}
                <div className="space-y-4">
                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">No posts found.</div>
                  ) : (
                    filteredPosts.map((post) => (
                      <Card key={post.id} className="border-0 shadow-sm overflow-hidden">
                        <CardHeader className="p-4 flex flex-row items-start gap-3 space-y-0">
                          <div className="cursor-pointer" onClick={() => setPreviewProfile({ user_id: post.user_id })}>
                            <Avatar>
                              <AvatarImage src={post.profiles?.avatar_url} />
                              <AvatarFallback>{post.profiles?.display_name?.[0]}</AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate flex items-center cursor-pointer" onClick={() => setPreviewProfile({ user_id: post.user_id })}>
                                {post.profiles?.display_name}
                                <VerifiedBadge userId={post.user_id} />
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                                {post.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {post.location}</span>}
                            </div>
                          </div>
                          
                          {post.user_id !== user?.id && (
                              myFriends.includes(post.user_id) ? (
                                  <Button size="sm" variant="ghost" className="text-blue-600 h-8" onClick={() => navigate(`/app/messages?userId=${post.user_id}`)}>
                                      <MessageCircle className="w-4 h-4 mr-1" /> Message
                                  </Button>
                              ) : sentRequests.includes(post.user_id) ? (
                                  <Button size="sm" variant="ghost" disabled className="text-muted-foreground h-8">
                                      <Check className="w-4 h-4 mr-1" /> Sent
                                  </Button>
                              ) : (
                                  <Button size="sm" variant="outline" className="h-8" onClick={() => handleConnect(post.user_id)}>
                                      <UserPlus className="w-4 h-4 mr-1" /> Connect
                                  </Button>
                              )
                          )}

                          <DropdownMenu>
                              <DropdownMenuTrigger><MoreVertical className="w-5 h-5 text-muted-foreground" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  {post.user_id === user?.id && (
                                      <DropdownMenuItem onClick={() => openEditPost(post)}><Edit2 className="w-4 h-4 mr-2" /> Edit Post</DropdownMenuItem>
                                  )}
                                  {post.user_id === user?.id && (
                                      <DropdownMenuItem className="text-red-600" onClick={() => handleDeletePost(post.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                                  )}
                              </DropdownMenuContent>
                          </DropdownMenu>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                          {post.image_url && (
                            <div className="rounded-xl overflow-hidden bg-muted">
                                {post.post_type === 'video' || post.image_url.includes('.mp4') || post.image_url.includes('.webm') ? (
                                    <video src={post.image_url} controls className="w-full max-h-[500px] object-contain" />
                                ) : (
                                    <img src={post.image_url} alt="Post content" className="w-full h-auto object-cover" />
                                )}
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="p-2 border-t flex justify-between">
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => handleLikePost(post)}>
                                <Heart className={`w-5 h-5 mr-2 ${post.is_liked_by_user ? 'text-red-500 fill-red-500' : ''}`} /> {post.likes_count || 0}
                            </Button>
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => openComments(post.id)}>
                                <MessageCircle className="w-5 h-5 mr-2" /> {post.comments_count || 0}
                            </Button>
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => handleRepost(post)}>
                                <Repeat className="w-5 h-5 mr-2" /> Repost
                            </Button>
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setSharePost(post)}>
                                <Share2 className="w-5 h-5 mr-2" /> Share
                            </Button>
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
            </TabsContent>

            {/* SPOTLIGHT CONTENT */}
            <TabsContent value="spotlight">
                <Tabs defaultValue="communities" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-transparent p-0 mb-4 gap-2">
                        <TabsTrigger value="communities" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-white">Communities</TabsTrigger>
                        <TabsTrigger value="events" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-white">Events</TabsTrigger>
                    </TabsList>

                    <TabsContent value="communities" className="space-y-4">
                        {filteredCommunities.map(c => (
                            <Card key={c.id} className="overflow-hidden border-border/60 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedCommunity(c)}>
                                <div className="flex items-center p-4 gap-4">
                                    <Avatar className="h-14 w-14 rounded-xl">
                                        <AvatarImage src={c.avatar_url} className="object-cover" />
                                        <AvatarFallback>{c.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-base truncate">{c.name}</h3>
                                        <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                                        <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium">
                                            <Users className="w-3 h-3" /> {c.member_count} members
                                        </div>
                                    </div>
                                    <Button size="sm" variant="secondary" className="rounded-full">View</Button>
                                </div>
                            </Card>
                        ))}
                    </TabsContent>

                    <TabsContent value="events" className="space-y-4">
                        {filteredEvents.map(e => (
                            <Card key={e.id} className="overflow-hidden border-border/60 hover:border-primary/50 transition-colors" onClick={() => setSelectedEvent(e)}>
                                <div className="h-32 w-full bg-muted relative">
                                    <img src={e.image_url} className="w-full h-full object-cover" />
                                    <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold">
                                        {new Date(e.start_date).getDate()} {new Date(e.start_date).toLocaleString('default', { month: 'short' })}
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold truncate">{e.title}</h3>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" /> {e.location}
                                    </p>
                                    <Button className="w-full mt-3 rounded-full" size="sm" variant="outline">View Details</Button>
                                </div>
                            </Card>
                        ))}
                    </TabsContent>
                </Tabs>
            </TabsContent>
        </Tabs>
      </div>

      {/* FAB: Floating Action Button */}
      <div className="fixed bottom-24 right-4 z-50">
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button className="h-14 w-14 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 shadow-lg hover:shadow-xl transition-all p-0">
                      <Plus className="h-8 w-8 text-white" />
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48 mb-2 p-1.5 rounded-xl border-0 shadow-xl bg-popover/95 backdrop-blur-lg">
                  <DropdownMenuItem onClick={() => openCreateModal('story')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3"><Plus className="w-4 h-4" /></div>
                      Create Story
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreateModal('post')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                       <div className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3"><Type className="w-4 h-4" /></div>
                      Create Post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreateModal('photo')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                       <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-3"><ImageIcon className="w-4 h-4" /></div>
                      Share Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreateModal('video')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                       <div className="h-8 w-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center mr-3"><Video className="w-4 h-4" /></div>
                      Share Video
                  </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* UNIFIED CREATE MODAL */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-background p-0 overflow-hidden gap-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>
                {createType === 'story' && "Create Story"}
                {createType === 'post' && "Create Post"}
                {createType === 'photo' && "Share Photo"}
                {createType === 'video' && "Share Video"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-4 space-y-4">
            {/* User Info */}
            <div className="flex gap-3 items-center">
              <Avatar className="w-10 h-10">
                <AvatarImage src={currentUserProfile?.avatar_url || undefined} />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                 <p className="font-semibold text-sm">
                   {currentUserProfile?.display_name || 'You'}
                   <VerifiedBadge userId={user.id} />
                 </p>
                 <p className="text-xs text-muted-foreground capitalize">{createType}</p>
              </div>
            </div>

            {/* Content Input */}
            <Textarea 
              placeholder={createType === 'story' ? "Add a caption..." : "What's on your mind? Use @ to tag friends"}
              value={createType === 'story' ? storyCaption : postText}
              onChange={createType === 'story' ? (e) => setStoryCaption(e.target.value) : handleTextChange}
              className="min-h-[100px] bg-transparent border-0 resize-none focus-visible:ring-0 p-0 text-base"
            />
            
            {/* Tag List */}
            {showTagList && (
                <div className="bg-popover border shadow-md rounded-md z-10 w-full max-h-40 overflow-y-auto">
                    {friends.filter(f => f.display_name.toLowerCase().includes(tagQuery.toLowerCase())).map(f => (
                        <div key={f.user_id} className="p-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-2" onClick={() => addTag(f.display_name)}>
                            <Avatar className="w-6 h-6"><AvatarImage src={f.avatar_url}/></Avatar> {f.display_name}
                        </div>
                    ))}
                </div>
            )}

            {/* Media Preview & Upload Area */}
            <div className="relative">
                {(createType === 'story' ? storyPreview : postMedia) ? (
                   <div className="relative rounded-xl overflow-hidden bg-black/5 max-h-64 flex items-center justify-center">
                      <button 
                        onClick={() => createType === 'story' ? setStoryPreview(null) : setPostMedia(null)} 
                        className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 p-1.5 rounded-full text-white transition-colors"
                      >
                          <X className="w-4 h-4" />
                      </button>
                      
                      {(createType === 'story' ? storyPreview?.file.type.startsWith('video') : postMedia?.type === 'video') ? (
                          <video src={createType === 'story' ? storyPreview?.url : postMedia?.url} controls className="max-h-64 w-full object-contain" />
                      ) : (
                          <img src={createType === 'story' ? storyPreview?.url : postMedia?.url} className="max-h-64 w-full object-cover" />
                      )}
                   </div>
                ) : (
                    // Upload Area triggers automatically for Photo/Video/Story if empty, or can be clicked
                    <div 
                      className="border-2 border-dashed border-muted rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => unifiedFileRef.current?.click()}
                    >
                        <input 
                            type="file" 
                            ref={unifiedFileRef} 
                            className="hidden" 
                            accept={
                                createType === 'video' ? "video/*" : 
                                createType === 'photo' ? "image/*" : 
                                "image/*,video/*"
                            } 
                            onChange={handleUnifiedFileSelect} 
                        />
                        <div className="bg-primary/10 p-4 rounded-full mb-3 text-primary">
                            {createType === 'video' ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {createType === 'post' ? "Add Photo/Video (Optional)" : `Upload ${createType}`}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                   {createType !== 'story' && (
                     <Button 
                        variant="outline" 
                        size="sm" 
                        className={`rounded-full ${locationData ? "text-blue-500 border-blue-200 bg-blue-50" : ""}`}
                        onClick={getLocation}
                     >
                        <MapPin className="w-4 h-4 mr-2" />
                        {locationData ? "Location Added" : "Add Location"}
                     </Button>
                   )}
                </div>
                <Button onClick={handleUnifiedSubmit} disabled={uploadingPost || uploadingStory} className="rounded-full px-6">
                    {(uploadingPost || uploadingStory) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {createType === 'story' ? 'Share Story' : 'Post'}
                </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={!!editingPost} onOpenChange={() => setEditingPost(null)}>
          <DialogContent>
              <DialogHeader><DialogTitle>Edit Post</DialogTitle></DialogHeader>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} />
              <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
                  <Button onClick={submitEditPost}>Save Changes</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Story Viewer */}
      {selectedStory && <StoryViewer user={selectedStory} onClose={() => setSelectedStory(null)} onStoryChange={fetchStories} />}

      {/* Comments Dialog */}
      <Dialog open={!!activeCommentPost} onOpenChange={() => { setActiveCommentPost(null); setReplyingTo(null); }}>
        <DialogContent className="sm:max-w-[500px] h-[70vh] flex flex-col overflow-hidden">
            <DialogHeader><DialogTitle>Comments</DialogTitle></DialogHeader>
            <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                    {postComments.length === 0 ? (
                      <p className="text-center text-muted-foreground py-10">No comments yet.</p>
                    ) : (
                      getThreadedComments().map(c => (
                        <div key={c.id} className="space-y-2">
                          {/* Parent Comment */}
                          <CommentItemUI
                            comment={c}
                            currentUserId={user?.id}
                            isLiked={likedComments.has(c.id)}
                            postId={activeCommentPost!}
                            onLike={handleLikeComment}
                            onReply={handleReply}
                            onEdit={handleEditComment}
                            onDelete={handleDeleteComment}
                            isReply={false}
                          />
                          {/* Replies */}
                          {c.replies?.length > 0 && (
                            <div className="ml-10 space-y-2 border-l-2 border-muted pl-3">
                              {c.replies.map((reply: any) => (
                                <CommentItemUI
                                  key={reply.id}
                                  comment={reply}
                                  currentUserId={user?.id}
                                  isLiked={likedComments.has(reply.id)}
                                  postId={activeCommentPost!}
                                  onLike={handleLikeComment}
                                  onReply={handleReply}
                                  onEdit={handleEditComment}
                                  onDelete={handleDeleteComment}
                                  isReply={true}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                </div>
            </ScrollArea>
            <div className="pt-2 border-t space-y-2">
              {replyingTo && (
                <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 rounded-lg text-sm">
                  <span className="text-muted-foreground">Replying to <span className="font-medium text-foreground">{replyingTo.name}</span></span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Input 
                  placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : "Write a comment..."} 
                  value={commentText} 
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                />
                <Button size="icon" onClick={submitComment}><Send className="w-4 h-4" /></Button>
              </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!sharePost} onOpenChange={() => setSharePost(null)}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Share to...</DialogTitle></DialogHeader>
              <ScrollArea className="h-60">
                  {friends.map(f => (
                      <div key={f.user_id} className="flex items-center justify-between p-3 hover:bg-muted rounded-lg cursor-pointer" onClick={() => handleShareToDM(f.user_id)}>
                          <div className="flex items-center gap-3">
                              <Avatar><AvatarImage src={f.avatar_url}/></Avatar>
                              <span>{f.display_name}</span>
                          </div>
                          <Send className="w-4 h-4 text-muted-foreground" />
                      </div>
                  ))}
                  {friends.length === 0 && <p className="text-center text-muted-foreground py-4">No friends found.</p>}
              </ScrollArea>
          </DialogContent>
      </Dialog>

      {/* Profile Preview */}
      <FriendProfilePreview 
        profile={previewProfile}
        open={!!previewProfile}
        onClose={() => setPreviewProfile(null)}
      />

      {/* ✅ ADDED: Detail Modals for Events & Communities */}
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
        onOpen={() => navigate('/app/messages?tab=community')} 
      />
    </div>
  );
};

export default Feed;