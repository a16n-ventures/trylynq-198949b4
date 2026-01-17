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
  MessageSquare, Eye, Type, CloudUpload, CreditCard, BarChart, ChevronRight, Info, Lock, ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow, isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from 'react-router-dom';
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { Slider } from "@/components/ui/slider"; import { VideoPlayer } from '@/components/feed/VideoPlayer'; 
// Assuming you have this or I will use standard input range if not available in your UI kit, will use standard range for safety

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
  post_type: 'status' | 'image' | 'video' | 'event' | 'repost' | 'ad';
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
    const checkPremium = async () => {
      // Check for active subscription OR active premium feature package
      const { data: sub } = await supabase.from('subscriptions')
        .select('status').eq('user_id', userId).eq('status', 'active').maybeSingle();
      const { data: feat } = await supabase.from('premium_features')
        .select('is_active').eq('user_id', userId).gt('expires_at', new Date().toISOString()).maybeSingle();
      
      setIsPremium(!!sub || !!feat);
    };
    checkPremium();
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
            <div className="flex items-center mb-1">
                <span className={`${isReply ? 'text-xs' : 'text-xs'} font-bold`}>
                    {comment.profiles?.display_name}
                </span>
                <VerifiedBadge userId={comment.user_id} />
            </div>
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

// --- STORY VIEWER --- //
import { InstagramStoryViewer } from '@/components/feed/InstagramStoryViewer';

function StoryViewer({ user, onClose, onStoryChange }: { user: Profile; onClose: () => void; onStoryChange?: () => void }) {
  return <InstagramStoryViewer user={user} onClose={onClose} onStoryChange={onStoryChange} />;
}

// --- SOCIAL FEED COMPONENT ---
const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [postText, setPostText] = useState('');
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  
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
  const [createType, setCreateType] = useState<'story' | 'post' | 'photo' | 'video' | 'ad'>('post');
  const unifiedFileRef = useRef<HTMLInputElement>(null);

  // --- AD WIZARD STATES (Adapted from screenshots) ---
  const [adStep, setAdStep] = useState<number>(0); // 0=Content, 1=Budget, 2=Review, 3=Payment, 4=Card
  const [adBudget, setAdBudget] = useState([2136]); // Daily budget default matches screenshot
  const [adDuration, setAdDuration] = useState([6]); // Duration default matches screenshot
  const [adGoal, setAdGoal] = useState('Profile visits');
  const [adAudience, setAdAudience] = useState('Nigeria');
  const [cardDetails, setCardDetails] = useState({ name: '', number: '', expiry: '', cvv: '' });

  // Comment & Share States
  const [activeCommentPost, setActiveCommentPost] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [postComments, setPostComments] = useState<any[]>([]);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  
  // Profile Preview
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  
  const [aiInsights, setAiInsights] = useState<string | null>(null);

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
    fetchSmartFeed();
    fetchStories();
    fetchRelationships();
    
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCurrentUserProfile(data); });
      
    const checkPremium = async () => {
        const { data: sub } = await supabase.from('subscriptions')
          .select('status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
        const { data: feat } = await supabase.from('premium_features')
          .select('is_active').eq('user_id', user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
        
        setIsPremium(!!sub || !!feat);
    };
    checkPremium();

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, () => {
         fetchSmartFeed(); 
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

    // 1. FALLBACK POST FETCHER (Required for error handling)
  const fetchPosts = async () => {
    const { data: posts, error } = await supabase
      .from('social_posts')
      .select(`*, profiles (display_name, avatar_url, user_id), post_likes (user_id)`)
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (!error && posts) {
      let finalPosts = posts;
    
      // NUCLEAR FIX: Filter ads in fallback too
      if (isPremium) {
         finalPosts = finalPosts.filter(p => p.post_type !== 'ad');
      }
    
      const formattedPosts = finalPosts.map((p: any) => ({
          ...p,
          // Fix: Ensure we strictly check if the ARRAY of likes contains the user ID
          is_liked_by_user: p.post_likes && Array.isArray(p.post_likes) && p.post_likes.some((l: any) => l.user_id === user?.id)
      }));
      setFeedPosts(formattedPosts as Post[]);
    }
    setLoading(false);
  };

  // 2. SPOTLIGHT FETCHER (Required for the Spotlight tab)
  const fetchSpotlightData = async () => {
    // Communities
    const { data: comms } = await supabase
      .from('communities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (comms) {
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

    // Events
    const { data: evts } = await supabase
      .from('events')
      .select(`*, event_attendees ( count )`)
      .gt('start_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (evts) {
      if (user) {
        const eventIds = evts.map(e => e.id);
        const { data: rsvps } = await supabase
          .from('event_attendees')
          .select('event_id')
          .eq('user_id', user.id)
          .in('event_id', eventIds);
        
        const rsvpSet = new Set(rsvps?.map(r => r.event_id) || []);
        setEvents(evts.map(e => ({ 
          ...e, 
          is_attending: rsvpSet.has(e.id),
          attendee_count: e.event_attendees?.[0]?.count || 0
        })));
      } else {
        setEvents(evts.map(e => ({
          ...e,
          attendee_count: e.event_attendees?.[0]?.count || 0
        })));
      }
    }
  };

  const fetchSmartFeed = async () => {
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('generate-smart-feed', {
        body: { user_id: user?.id }
      });

      if (error) throw error;

      if (response && response.posts) {
        let rawPosts = response.posts;
      
        // FIX ADS: If premium, remove ANYTHING marked as 'ad', regardless of source
        if (isPremium) {
          rawPosts = rawPosts.filter((p: any) => p.post_type !== 'ad');
        }
        
        const postIds = rawPosts.map((p: any) => p.id);

        // FIX LIKES: Manually fetch YOUR likes for these specific posts
        const { data: myLikes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user?.id)
          .in('post_id', postIds);
        
        // Create a "Set" (Lookup Table) of posts you liked
        const likedPostIds = new Set(myLikes?.map((l: any) => l.post_id));
        
        // Map the posts and Force 'is_liked_by_user' to match the lookup table
        const formattedPosts = rawPosts.map((p: any) => ({
            ...p,
            is_liked_by_user: likedPostIds.has(p.id) 
        }));
        
        setFeedPosts(formattedPosts);
        
        if (response.events) {
          setEvents(response.events.map((e: any) => ({
              ...e,
              attendee_count: e.attendee_count || 0,
              is_attending: false // You could fetch RSVP status here if needed, but simple is fine for now
          })));
        }

        // 3. HANDLE SMART COMMUNITIES (Exclusive Logic) - THIS WAS MISSING
        if (response.communities) {
           setCommunities(response.communities.map((c: any) => ({
             ...c,
             avatar_url: c.cover_url || c.avatar_url || null,
             // The algorithm already calculated 'is_member' and 'my_role'
           })));
        }
        setAiInsights(response.ai_insights || null);
      }
    } catch (err) {
      console.error("Smart Feed Error:", err);
      fetchPosts(); 
      fetchSpotlightData();
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER TO OPEN MODAL ---
  const openCreateModal = (type: 'story' | 'post' | 'photo' | 'video' | 'ad') => {
    setCreateType(type);
    setCreateModalOpen(true);
    // Clear states when opening
    setPostText('');
    setPostMedia(null);
    setLocationData(null);
    setStoryCaption('');
    setStoryPreview(null);
    setAdStep(0); // Reset ad step
    setCardDetails({ name: '', number: '', expiry: '', cvv: '' });
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
      let postType = createType === 'ad' ? 'ad' : 'status'; // Handle Ad type

      if (postMedia) {
        const ext = postMedia.file.name.split('.').pop();
        const path = `posts/${user?.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post_media').upload(path, postMedia.file);
        if (uploadError) throw uploadError;
        
        const res = supabase.storage.from('post_media').getPublicUrl(path);
        publicUrl = res.data.publicUrl;
        postType = postMedia.type;
      }

      // 1. Create Post
      const { data: postData, error } = await supabase.from('social_posts').insert({
        user_id: user?.id,
        content: postText.trim(),
        post_type: postType,
        image_url: publicUrl,
        location: locationData 
      }).select('id').single();

      if (error) throw error;

      // 2. Create Ad Record (if type is ad)
      if (createType === 'ad' && postData) {
         // Fix: Ensure minimum budget of 2136
         const budgetVal = Math.max(adBudget[0], 2136); 
         const durationVal = adDuration[0];
         const totalBudget = budgetVal * durationVal;
         const vat = totalBudget * 0.075;
         const amountToPay = totalBudget + vat;

         try {
             // Fix: Insert into user_ads with correct schema fields
             const { error: adError } = await supabase.from('user_ads').insert({
                 user_id: user?.id,
                 post_id: postData.id,
                 title: 'Promoted Post',
                 content: postText.substring(0, 100) || 'Sponsored Content',
                 image_url: publicUrl,
                 link_url: `/app/feed?post=${postData.id}`,
                 goal: 'profile_visits', // Matching default state
                 target_audience: adAudience,
                 daily_budget: budgetVal,
                 total_budget: totalBudget,
                 duration_days: durationVal,
                 amount_paid: amountToPay,
                 status: 'pending',
                 payment_status: 'pending'
             });
             
             if (adError) throw adError;
         } catch (adError) {
             console.error("Ad creation failed:", adError);
             toast.error("Post created but Ad submission failed.");
         }
      }

      toast.success(createType === 'ad' ? 'Ad created successfully!' : 'Post created!');
      setPostText('');
      setPostMedia(null);
      setLocationData(null);
      setCreateModalOpen(false); // Close unified modal
      fetchSmartFeed();
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
    } else if (createType === 'ad') {
       if (adStep < 4) {
           setAdStep(prev => prev + 1); // Progress through Wizard
       } else {
           handleCreatePost(); // Final submission
       }
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
          fetchSmartFeed();
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
    if (!user) return;

    // KEY FIX: Force boolean with !! to ensure instant reaction
    const wasLiked = !!post.is_liked_by_user;
    
    // 1. Optimistic Update (INSTANT UI FLIP)
    setFeedPosts(prev => prev.map(p => p.id === post.id ? { 
        ...p, 
        likes_count: wasLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
        is_liked_by_user: !wasLiked 
    } : p));
  
    try {
      if (wasLiked) {
          // Database call happens in background
          const { error } = await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: user.id });
          if (!error) await supabase.rpc('decrement_post_likes', { post_id: post.id });
      } else {
          const { error } = await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
          if (!error) await supabase.rpc('increment_post_likes', { post_id: post.id });
      }
    } catch (err) {
      console.error("Like failed", err);
      // Revert if DB fails
      setFeedPosts(prev => prev.map(p => p.id === post.id ? { 
          ...p, 
          likes_count: wasLiked ? p.likes_count : p.likes_count,
          is_liked_by_user: wasLiked 
      } : p));
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

  // Step 1: Fetch comments only
  const { data: comments, error: commentsError } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (commentsError) {
    console.error('Error fetching comments:', commentsError);
    setPostComments([]);
    return;
  }

  if (!comments || comments.length === 0) {
    setPostComments([]);
    return;
  }

  // Step 2: Fetch profiles for comment authors
  const userIds = [...new Set(comments.map(c => c.user_id).filter(Boolean))];

  let profilesMap = new Map<string, any>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);

    if (profiles) {
      profiles.forEach(p => profilesMap.set(p.user_id, p));
    }
  }

  // Step 3: Merge comments + profiles
  const mergedComments = comments.map(c => ({
    ...c,
    profiles: profilesMap.get(c.user_id) ?? {
      display_name: 'User',
      avatar_url: null,
      id: c.user_id,
    },
  }));

  setPostComments(mergedComments);

  // Step 4: Fetch liked comments
  if (user) {
    const commentIds = mergedComments.map(c => c.id);

    const { data: likes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', user.id)
      .in('comment_id', commentIds);

    if (likes) {
      setLikedComments(new Set(likes.map(l => l.comment_id)));
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
  
    // Find the community to check its type/status
    const targetCommunity = communities.find(c => c.id === communityId);
  
    // NUCLEAR FIX 5: Gatekeeping
    // Assuming 'is_exclusive' or checking specific criteria. 
    // You can also add a column 'requires_premium' to your communities table.
    if (targetCommunity?.name.toLowerCase().includes('exclusive') || targetCommunity?.description?.toLowerCase().includes('premium')) {
       if (!isPremium) {
          toast.error("This community is for Premium members only. Please upgrade to join!");
          // Optional: Trigger upgrade modal here
          return; 
       }
    }
  
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
        
        // UPDATE BOTH LIST AND SELECTED EVENT
        const updateFn = (e: Event) => ({ ...e, is_attending: false, attendee_count: Math.max((e.attendee_count || 0) - 1, 0) });
        setEvents(prev => prev.map(e => e.id === eventId ? updateFn(e) : e));
        if (selectedEvent?.id === eventId) setSelectedEvent(prev => prev ? updateFn(prev) : null);

      } else {
        if (event?.price && event.price > 0) {
          // ... (Payment logic remains unchanged) ...
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
          
          // UPDATE BOTH LIST AND SELECTED EVENT
          const updateFn = (e: Event) => ({ ...e, is_attending: true, attendee_count: (e.attendee_count || 0) + 1 });
          setEvents(prev => prev.map(e => e.id === eventId ? updateFn(e) : e));
          if (selectedEvent?.id === eventId) setSelectedEvent(prev => prev ? updateFn(prev) : null);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to RSVP");
    }
  };

  const filteredPosts = feedPosts.filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase()) || p.profiles.display_name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredCommunities = communities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- AD WIZARD HELPERS ---
  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount);
  };
  
  const estimatedReach = (budget: number, days: number) => {
    // Rough logic based on screenshots: 2136/day -> 6500-17000 reach/6 days
    const baseMultiplier = 3; 
    const total = budget * days;
    const min = Math.floor(total * 0.5);
    const max = Math.floor(total * 1.3);
    return `${min.toLocaleString()} - ${max.toLocaleString()}`;
  };

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
                
                {isPremium && aiInsights && (
                  <Card className="border-amber-200/50 bg-gradient-to-r from-amber-50/50 to-orange-50/50 shadow-sm mb-4 overflow-hidden">
                    <CardContent className="p-4 flex gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shrink-0 shadow-sm">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                           The Vibe Check 
                           <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] h-5">Premium</Badge>
                        </h3>
                        <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
                          {aiInsights}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

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
                    filteredPosts.map((post) => {
                      // Ensure we have valid profile data with fallbacks
                      const authorName = post.profiles?.display_name || 'Unknown User';
                      const authorAvatar = post.profiles?.avatar_url || undefined;
                      const authorInitial = authorName[0]?.toUpperCase() || 'U';
                      
                      return (
                      <Card key={post.id} className="border-0 shadow-sm overflow-hidden">
                        <CardHeader className="p-4 flex flex-row items-start gap-3 space-y-0">
                          <div className="cursor-pointer" onClick={() => setPreviewProfile({ user_id: post.user_id })}>
                            <Avatar className="w-10 h-10 border border-border/50">
                              <AvatarImage src={authorAvatar} className="object-cover" />
                              <AvatarFallback className="bg-muted text-muted-foreground font-medium">{authorInitial}</AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate flex items-center cursor-pointer hover:underline underline-offset-2" onClick={() => setPreviewProfile({ user_id: post.user_id })}>
                                {authorName}
                                <VerifiedBadge userId={post.user_id} />
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                                {post.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {post.location}</span>}
                                {post.post_type === 'ad' && (
                                  <Badge variant="outline" className="h-4 text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                                    Sponsored
                                  </Badge>
                                )}
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
                          {post.post_type === 'video' || post.image_url?.includes('.mp4') || post.image_url?.includes('.webm') || post.image_url?.includes('.mov') ? (
                                    <VideoPlayer 
                                      src={post.image_url!} 
                                      className="w-full max-h-[500px] bg-black aspect-video" 
                                    />
                                ) : (
                                  <div className="w-full aspect-[4/5] bg-muted relative overflow-hidden border-y border-border/40">
                                      <img 
                                        src={post.image_url} 
                                        alt="Post content" 
                                        className="w-full h-full object-cover" 
                                        loading="lazy" 
                                      />
                                  </div>
                                )}
                            </div>
                          )}
                          {post.post_type === 'ad' && (
                             <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-lg flex items-center justify-between">
                                 <div className="text-xs text-blue-800">
                                     <span className="font-bold">Sponsored Post</span> • Learn More
                                 </div>
                                 <ChevronRight className="w-4 h-4 text-blue-400" />
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
                    );})
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
                        {filteredEvents.map(e => {
                            const status = getEventStatus(e.start_date);
                            const isNew = new Date(e.start_date).getTime() - Date.now() < 24 * 60 * 60 * 1000 && new Date(e.start_date) > new Date();
                            
                            return (
                            <Card key={e.id} className="overflow-hidden border-border/60 hover:border-primary/50 transition-colors" onClick={() => setSelectedEvent(e)}>
                                <div className="h-32 w-full bg-muted relative">
                                    <img src={e.image_url} className="w-full h-full object-cover" />
                                    {/* Status Badge */}
                                    <Badge className={`absolute top-2 left-2 ${status.color} text-white border-0 shadow-md ${status.label === 'Happening Now' || status.label === 'Ending Soon' ? 'animate-pulse' : ''}`}>
                                        {status.label === 'Happening Now' && <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-ping inline-block" />}
                                        {status.label}
                                    </Badge>
                                    {/* New Event Badge */}
                                    {isNew && (
                                        <Badge className="absolute top-2 right-12 bg-yellow-500 text-white border-0 shadow-md">
                                            New
                                        </Badge>
                                    )}
                                    <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold">
                                        {new Date(e.start_date).getDate()} {new Date(e.start_date).toLocaleString('default', { month: 'short' })}
                                    </div>
                                    {e.is_sponsored && (
                                        <Badge className="absolute bottom-2 left-2 bg-yellow-500/90 text-white border-0 shadow-md">
                                            <Megaphone className="w-3 h-3 mr-1" /> Sponsored
                                        </Badge>
                                    )}
                                </div>
                                <div className="p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-bold truncate flex-1">{e.title}</h3>
                                        {e.price && e.price > 0 ? (
                                            <Badge variant="secondary" className="text-xs shrink-0">₦{e.price.toLocaleString()}</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-xs text-green-600 border-green-200 shrink-0">Free</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" /> {e.location}
                                    </p>
                                    <div className="flex items-center justify-between mt-1">
                                        <p className="text-xs text-primary font-medium flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {e.attendee_count || 0} attending
                                        </p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {new Date(e.start_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <Button 
                                        className={`w-full mt-3 rounded-full ${e.is_attending ? 'bg-green-600 hover:bg-green-700' : ''}`} 
                                        size="sm" 
                                        variant={e.is_attending ? 'default' : 'outline'}
                                    >
                                        {e.is_attending ? <><Check className="w-4 h-4 mr-1" /> Going</> : 'View Details'}
                                    </Button>
                                </div>
                            </Card>
                        );})}
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
              <DropdownMenuContent side="top" align="end" className="w-auto mb-2 p-1.5 rounded-xl border-0 shadow-xl bg-popover/95 backdrop-blur-lg">
                  <DropdownMenuItem onClick={() => openCreateModal('story')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3"><Plus className="w-4 h-4" /></div>
                      Story
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreateModal('post')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                       <div className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3"><Type className="w-4 h-4" /></div>
                      Post
                  </DropdownMenuItem>
                  {/* Added Ad Button to FAB - Only for Premium */}
                  {isPremium && (
                  <DropdownMenuItem onClick={() => openCreateModal('ad')} className="p-2.5 rounded-lg focus:bg-muted font-medium cursor-pointer">
                       <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mr-3">
                          <Megaphone className="w-4 h-4" />
                       </div>
                      Ad
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* UNIFIED CREATE MODAL */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-background p-0 overflow-hidden gap-0">
          <DialogHeader className="p-4 border-b">
            {/* Dynamic Header for Ad Wizard */}
            {createType === 'ad' && adStep > 0 ? (
                <div className="flex items-center gap-3">
                    <Button size="icon" variant="ghost" className="h-8 w-8 -ml-2" onClick={() => setAdStep(s => s - 1)}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <DialogTitle>
                        {adStep === 1 && "Budget & duration"}
                        {adStep === 2 && "Review"}
                        {adStep === 3 && "Payment method"}
                        {adStep === 4 && "Debit or credit card"}
                    </DialogTitle>
                    <div className="ml-auto text-xs text-muted-foreground font-medium">Step {adStep}/4</div>
                </div>
            ) : (
                <DialogTitle>
                    {createType === 'story' && "Story"}
                    {createType === 'post' && "Post"}
                    {createType === 'photo' && "Photo"}
                    {createType === 'video' && "Video"}
                    {createType === 'ad' && "Create Ad Content"}
                </DialogTitle>
            )}
          </DialogHeader>
          
          <div className="p-4 space-y-4">
            
            {/* --- AD WIZARD STEPS --- */}
            
            {/* STEP 0: Content Creation (Standard Post Input) */}
            {createType === 'ad' && adStep === 0 && (
                <>
                   <div className="flex gap-3 items-center">
                     <Avatar className="w-10 h-10"><AvatarImage src={currentUserProfile?.avatar_url || undefined} /><AvatarFallback>U</AvatarFallback></Avatar>
                     <div className="flex-1">
                        <p className="font-semibold text-sm flex items-center gap-1">{currentUserProfile?.display_name || 'You'}<VerifiedBadge userId={user.id} /></p>
                        <p className="text-xs text-muted-foreground">Create your ad creative</p>
                     </div>
                   </div>
                   <Textarea 
                     placeholder="Write your ad copy..."
                     value={postText}
                     onChange={handleTextChange}
                     className="min-h-[100px] bg-transparent border-0 resize-none focus-visible:ring-0 p-0 text-base"
                   />
                   <div className="relative">
                       {postMedia ? (
                          <div className="relative rounded-xl overflow-hidden bg-black/5 max-h-64 flex items-center justify-center">
                             <button onClick={() => setPostMedia(null)} className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 p-1.5 rounded-full text-white transition-colors"><X className="w-4 h-4" /></button>
                             {postMedia.type === 'video' ? <video src={postMedia.url} controls className="max-h-64 w-full object-contain" /> : <img src={postMedia.url} className="max-h-64 w-full object-cover" />}
                          </div>
                       ) : (
                           <div className="border-2 border-dashed border-muted rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => unifiedFileRef.current?.click()}>
                               <input type="file" ref={unifiedFileRef} className="hidden" accept="image/*,video/*" onChange={handleUnifiedFileSelect} />
                               <div className="bg-primary/10 p-4 rounded-full mb-3 text-primary"><ImageIcon className="w-6 h-6" /></div>
                               <p className="text-sm font-medium text-muted-foreground">Add Ad Media</p>
                           </div>
                       )}
                   </div>
                </>
            )}

            {/* STEP 1: Budget & Duration */}
            {createType === 'ad' && adStep === 1 && (
                <div className="space-y-8 pt-2">
                    <div className="text-center space-y-2">
                        <h3 className="text-lg font-bold">What's your ad budget?</h3>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold">Daily budget</span>
                            <span className="text-muted-foreground">{formatNaira(adBudget[0])} daily</span>
                        </div>
                        <Slider 
                           value={adBudget} 
                           onValueChange={setAdBudget} 
                           min={2136} 
                           max={50000} 
                           step={100} 
                           className="py-4"
                        />
                    </div>

                    <div className="space-y-4">
                         <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold">Duration</span>
                            <span className="text-muted-foreground">{adDuration[0]} days</span>
                        </div>
                        <div className="flex gap-2 p-3 bg-muted/30 rounded-lg border cursor-pointer">
                            <div className="h-5 w-5 rounded-full border-2 border-primary flex items-center justify-center"><div className="w-2.5 h-2.5 bg-primary rounded-full" /></div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">Set duration</p>
                                <Slider 
                                   value={adDuration} 
                                   onValueChange={setAdDuration} 
                                   max={30} 
                                   step={1} 
                                   className="mt-4"
                                />
                                <p className="text-xs text-muted-foreground mt-2">{adDuration[0]} days</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl border flex gap-3 items-start">
                         <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                         <div>
                             <p className="font-medium text-sm">Your selections might limit your profile visits</p>
                             <p className="text-xs text-muted-foreground mt-1">
                                 Businesses like yours spend {formatNaira(7121)} per day over 5 days.
                             </p>
                             <button className="text-xs text-blue-600 font-medium mt-1">About similar businesses</button>
                         </div>
                    </div>
                    
                    <div className="flex justify-between items-end border-t pt-4">
                        <div>
                            <p className="text-sm font-medium">Ad budget</p>
                            <p className="text-xs text-muted-foreground">Estimated reach</p>
                        </div>
                        <div className="text-right">
                             <p className="font-bold">{formatNaira(adBudget[0] * adDuration[0])} over {adDuration[0]} days</p>
                             <p className="text-xs text-muted-foreground">{estimatedReach(adBudget[0], adDuration[0])}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 2: Review */}
            {createType === 'ad' && adStep === 2 && (
                <div className="space-y-6">
                    <div className="text-center">
                        <h3 className="text-lg font-bold">Everything look good?</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="font-medium">Goal</p>
                            <p className="text-sm text-muted-foreground">Profile visits to {currentUserProfile?.display_name || 'profile'}</p>
                        </div>
                        <div>
                            <p className="font-medium">Audience</p>
                            <p className="text-sm text-muted-foreground">People most likely to engage | {adAudience}</p>
                        </div>
                        <div>
                            <p className="font-medium">Budget & duration</p>
                            <p className="text-sm text-muted-foreground">{formatNaira(adBudget[0] * adDuration[0])} over {adDuration[0]} days</p>
                        </div>
                        <div className="flex justify-between items-center py-2">
                             <span className="font-medium">Preview ad</span>
                             <div className="flex items-center gap-2 cursor-pointer">
                                 {postMedia ? (
                                    <div className="w-8 h-8 bg-muted rounded overflow-hidden">
                                        <img src={postMedia.url} className="w-full h-full object-cover" />
                                    </div>
                                 ) : (
                                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center"><ImageIcon className="w-4 h-4" /></div>
                                 )}
                                 <ChevronRight className="w-4 h-4 text-muted-foreground" />
                             </div>
                        </div>
                    </div>

                    <div className="border-t pt-4 space-y-3">
                        <h4 className="font-bold">Cost Summary</h4>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Ad Budget</span>
                            <span>{formatNaira(adBudget[0] * adDuration[0])}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Estimated VAT</span>
                            <span>{formatNaira((adBudget[0] * adDuration[0]) * 0.075)}</span>
                        </div>
                         <div className="flex justify-between font-bold text-base pt-2">
                            <span>Total Spend</span>
                            <span>{formatNaira((adBudget[0] * adDuration[0]) * 1.075)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Ads are reviewed within 24 hours, although in some cases it may take longer. Once they're running, you can pause spending at any time.
                        </p>
                    </div>
                </div>
            )}

            {/* STEP 3: Payment Method */}
            {createType === 'ad' && adStep === 3 && (
                 <div className="space-y-6">
                    <div className="text-center">
                        <h3 className="text-lg font-bold">Add payment method</h3>
                    </div>
                    
                    <div className="border rounded-xl p-4 flex items-center justify-between cursor-pointer border-blue-500 bg-blue-50/50">
                        <div className="flex items-center gap-3">
                             <CreditCard className="w-6 h-6 text-blue-600" />
                             <span className="font-medium">Debit or credit card</span>
                        </div>
                        <div className="h-5 w-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
                        </div>
                    </div>
                    
                    <div className="flex gap-1 justify-center pt-4">
                        {/* Icons for Visa, Master, Amex etc */}
                        <div className="h-6 w-10 bg-blue-800 rounded text-[8px] text-white flex items-center justify-center font-bold">VISA</div>
                        <div className="h-6 w-10 bg-orange-500 rounded text-[8px] text-white flex items-center justify-center font-bold">MC</div>
                        <div className="h-6 w-10 bg-blue-400 rounded text-[8px] text-white flex items-center justify-center font-bold">AMEX</div>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-8">
                        <Lock className="w-3 h-3" />
                        Your payment methods are saved and stored securely.
                    </div>
                 </div>
            )}
            
            {/* STEP 4: Card Details */}
             {createType === 'ad' && adStep === 4 && (
                 <div className="space-y-6">
                    <div className="text-center">
                        <h3 className="text-lg font-bold">Debit or credit card</h3>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="space-y-2">
                             <Input placeholder="Name on card" className="h-12 rounded-xl" value={cardDetails.name} onChange={e => setCardDetails({...cardDetails, name: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                             <Input placeholder="Card number" className="h-12 rounded-xl" value={cardDetails.number} onChange={e => setCardDetails({...cardDetails, number: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input placeholder="MM/YY" className="h-12 rounded-xl" value={cardDetails.expiry} onChange={e => setCardDetails({...cardDetails, expiry: e.target.value})} />
                            <Input placeholder="CVV" className="h-12 rounded-xl" type="password" value={cardDetails.cvv} onChange={e => setCardDetails({...cardDetails, cvv: e.target.value})} />
                        </div>
                    </div>

                     <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-8 text-center px-4">
                        <Lock className="w-3 h-3 flex-shrink-0" />
                        <span>Your payment methods are saved and stored securely.<br/><span className="text-blue-600">Terms and applicable Privacy Policies apply</span></span>
                    </div>
                 </div>
            )}

            {/* STANDARD NON-AD CONTENT INPUT (Existing Logic) */}
            {createType !== 'ad' && (
                <>
                {/* User Info */}
                <div className="flex gap-3 items-center">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={currentUserProfile?.avatar_url || undefined} />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                     <p className="font-semibold text-sm flex items-center gap-1">
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
                </>
            )}
            
            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                   {/* Hide generic actions if in Ad Wizard > Step 0 */}
                   {createType !== 'story' && (createType !== 'ad' || adStep === 0) && (
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
                    {createType === 'story' ? 'Share Story' : 
                     createType === 'ad' ? (adStep === 2 ? 'Boost post' : adStep === 4 ? 'Save' : 'Next') : 
                     'Post'}
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
