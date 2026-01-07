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
  MessageSquare, Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow, isPast, isFuture, isToday, addHours, differenceInMinutes } from "date-fns";
import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from 'react-router-dom';

// --- CUSTOM COMPONENTS & HOOKS ---
import { FriendProfilePreview } from '@/components/friends/FriendProfilePreview';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useFeedPosts, Post } from '@/hooks/useFeedData';
import { useStories, StoryUser } from '@/hooks/useStories';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

// --- CONSTANTS ---
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// --- TYPES (Local) ---
interface Profile { 
  id?: string; 
  user_id?: string;
  display_name: string | null; 
  avatar_url: string | null;
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
  created_at?: string;
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
  created_at?: string;
}

// --- HELPER FUNCTIONS ---
const getEventStatus = (startDate: string) => {
  const date = new Date(startDate);
  const now = new Date();
  const expirationTime = addHours(date, 3);

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

// --- MODAL COMPONENTS ---

function EventDetailModal({ event, isOpen, onClose, onRSVP }: { 
  event: Event | null; isOpen: boolean; onClose: () => void; onRSVP: (eventId: string) => void;
}) {
  if (!event) return null;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
        {event.image_url && (
          <div className="w-full h-48 bg-muted relative">
            <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
            {event.is_sponsored && <Badge className="absolute top-4 left-4 bg-yellow-500 text-white">Sponsored</Badge>}
          </div>
        )}
        <div className="p-6 space-y-4">
          <div><h2 className="text-2xl font-bold mb-2">{event.title}</h2><p className="text-muted-foreground">{event.description}</p></div>
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3"><Calendar className="w-5 h-5 text-primary" /><div><p className="font-medium">When</p><p className="text-sm text-muted-foreground">{formatDate(event.start_date)}</p></div></div>
            {event.location && <div className="flex items-start gap-3"><MapPin className="w-5 h-5 text-primary" /><div><p className="font-medium">Where</p><p className="text-sm text-muted-foreground">{event.location}</p></div></div>}
            {event.price !== undefined && <div className="flex items-start gap-3"><Ticket className="w-5 h-5 text-primary" /><div><p className="font-medium">Price</p><p className="text-sm text-muted-foreground">{event.price === 0 ? 'Free' : `₦${event.price.toLocaleString()}`}</p></div></div>}
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onRSVP(event.id); onClose(); }} className={event.is_attending ? "bg-green-600" : ""}>
              {event.is_attending ? <><Check className="mr-2 h-4 w-4"/> Going</> : "RSVP"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommunityDetailModal({ community, isOpen, onClose, onJoin, onOpen }: {
  community: Community | null; isOpen: boolean; onClose: () => void; onJoin: (id: string) => void; onOpen: () => void;
}) {
  if (!community) return null;
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
        {(community.cover_url || community.avatar_url) && (
          <div className="w-full h-48 bg-muted relative">
            <img src={community.cover_url || community.avatar_url || '/default-avatar.png'} alt={community.name} className="w-full h-full object-cover" />
            {community.is_member && <Badge className="absolute top-4 right-4 bg-green-600">Joined</Badge>}
          </div>
        )}
        <div className="p-6 space-y-4">
          <div><h2 className="text-2xl font-bold mb-2">{community.name}</h2><p className="text-muted-foreground">{community.description}</p></div>
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3"><Users className="w-5 h-5 text-primary" /><div><p className="font-medium">Members</p><p className="text-sm text-muted-foreground">{community.member_count || 0} members</p></div></div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {community.is_member ? <Button onClick={() => { onOpen(); onClose(); }}>Open</Button> : <Button onClick={() => { onJoin(community.id); onClose(); }}>Join</Button>}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- STORY VIEWER ---
function StoryViewer({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { user: currentUser } = useAuth();
  const [index, setIndex] = useState(0);
  
  // Use the hook to fetch stories for the specific user being viewed
  // Resolves ID mismatch by checking both fields
  const targetId = user.user_id || user.id;
  const { storyUsers } = useStories(targetId);
  const userStories = storyUsers.find(u => u.user_id === targetId)?.stories || [];
  
  const current = userStories[index];
  const isMyStory = currentUser?.id === targetId;
  const { isPremium } = usePremiumStatus(targetId);

  useEffect(() => {
    if (!current && userStories.length > 0) setIndex(0);
    else if (!current && userStories.length === 0) {
       // Allow time for fetch, otherwise close? 
       // For now, keep open if loading or show empty state if needed.
    }
  }, [userStories, current]);

  const next = () => {
    if (index < userStories.length - 1) setIndex(i => i + 1);
    else onClose();
  };

  if (!current) return null;

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent shadow-none h-full sm:h-auto flex flex-col justify-center items-center">
        <div className="relative w-full h-full sm:h-[75vh] max-h-[800px] bg-black sm:rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl">
          <div className="absolute top-0 w-full z-20 flex gap-1 p-2">
            {userStories.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-white' : 'bg-white/20'}`} />
            ))}
          </div>
          <div className="absolute top-6 left-0 w-full p-4 z-20 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent">
            <img src={user.avatar_url || '/default-avatar.png'} className="w-10 h-10 rounded-full border-2 border-white/20 object-cover" />
            <div className="flex-1">
              <span className="text-white font-bold text-sm drop-shadow-md flex items-center gap-1">
                {isMyStory ? 'Your Story' : user.display_name}
                <VerifiedBadge isPremium={isPremium} className="text-blue-400" />
              </span>
              <span className="text-white/70 text-xs block">{formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}</span>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-2"><X className="w-6 h-6" /></button>
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
                <p className="text-white text-xl text-center px-8">{current.content}</p>
              )}
            </div>
            {current.media_url && current.content && (
              <div className="absolute bottom-20 left-0 right-0 px-6">
                <p className="text-white text-center text-sm bg-black/40 backdrop-blur-sm rounded-full py-2 px-4">{current.content}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- MAIN FEED COMPONENT ---
const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Custom Hooks
  const { posts: feedPosts, likePost, deletePost, isLoading: postsLoading } = useFeedPosts(user?.id);
  const { storyUsers, uploadStory, isUploading: uploadingStory } = useStories(user?.id);
  
  // States
  const [postText, setPostText] = useState('');
  const [postMedia, setPostMedia] = useState<{ file: File, url: string, type: 'image' | 'video' } | null>(null);
  const [uploadingPost, setUploadingPost] = useState(false);
  const [locationData, setLocationData] = useState<string | null>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);

  // UI States
  const [selectedStory, setSelectedStory] = useState<Profile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [storyPreview, setStoryPreview] = useState<{ file: File, url: string } | null>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [activeCommentPost, setActiveCommentPost] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [postComments, setPostComments] = useState<any[]>([]);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  // Search & Spotlight
  const [searchQuery, setSearchQuery] = useState("");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  
  // Tagging
  const [friends, setFriends] = useState<any[]>([]);
  const [showTagList, setShowTagList] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [myFriends, setMyFriends] = useState<string[]>([]);
  const [sentRequests, setSentRequests] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCurrentUserProfile(data); });

    fetchSpotlightData();
    fetchFriends();
    
    // Cleanup URLs
    return () => {
        if (postMedia) URL.revokeObjectURL(postMedia.url);
        if (storyPreview) URL.revokeObjectURL(storyPreview.url);
    };
  }, [user]);

  const fetchFriends = async () => {
    const { data } = await supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user?.id},addressee_id.eq.${user?.id}`).eq('status', 'accepted');
    if (data) {
        const friendIds = data.map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id);
        setMyFriends(friendIds);
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', friendIds);
        setFriends(profiles || []);
    }
    const {data: reqs} = await supabase.from('friendships').select('addressee_id').eq('requester_id', user?.id).eq('status', 'pending');
    if(reqs) setSentRequests(reqs.map(r => r.addressee_id));
  };

  const fetchSpotlightData = async () => {
    // ✅ OPTIMIZED: Sort by latest
    const { data: comms } = await supabase.from('communities').select('*').order('created_at', { ascending: false }).limit(20);
    if (comms) {
      if (user) {
        const { data: memberships } = await supabase.from('community_members').select('community_id, role').eq('user_id', user.id);
        const membershipMap = new Map(memberships?.map(m => [m.community_id, m.role]) || []);
        setCommunities(comms.map(c => ({ ...c, avatar_url: c.cover_url || null, is_member: membershipMap.has(c.id), my_role: membershipMap.get(c.id) || null })));
      } else {
        setCommunities(comms.map(c => ({ ...c, avatar_url: c.cover_url || null })));
      }
    }

    const { data: evts } = await supabase.from('events').select('*').gt('start_date', new Date().toISOString()).order('created_at', { ascending: false }).limit(20);
    if (evts && user) {
      const eventIds = evts.map(e => e.id);
      const { data: rsvps } = await supabase.from('event_attendees').select('event_id').eq('user_id', user.id).in('event_id', eventIds);
      const rsvpSet = new Set(rsvps?.map(r => r.event_id) || []);
      setEvents(evts.map(e => ({ ...e, is_attending: rsvpSet.has(e.id) })));
    } else if (evts) {
      setEvents(evts);
    }
  };

  // --- ACTIONS ---
  const handleStoryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setStoryPreview({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) });
  };

  const handleStoryUpload = () => {
    if (!storyPreview) return;
    uploadStory({ file: storyPreview.file, caption: storyCaption });
    setStoryPreview(null); setStoryCaption("");
  };

  const handlePostMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPostMedia({ file, url: URL.createObjectURL(file), type: file.type.startsWith('video') ? 'video' : 'image' });
    }
  };

  const handleCreatePost = async () => {
    if (!postText.trim() && !postMedia) { toast.error('Please write something or add media'); return; }
    setUploadingPost(true);
    try {
      let publicUrl = null;
      let postType = 'status';
      if (postMedia) {
        const ext = postMedia.file.name.split('.').pop();
        const path = `posts/${user?.id}/${Date.now()}.${ext}`;
        await supabase.storage.from('post_media').upload(path, postMedia.file);
        const { data } = supabase.storage.from('post_media').getPublicUrl(path);
        publicUrl = data.publicUrl;
        postType = postMedia.type;
      }
      await supabase.from('social_posts').insert({
        user_id: user?.id, content: postText.trim(), post_type: postType, image_url: publicUrl, location: locationData 
      });
      toast.success('Post created!');
      setPostText(''); setPostMedia(null); setLocationData(null);
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
    } catch (error) { toast.error('Failed to create post'); } 
    finally { setUploadingPost(false); }
  };

  const handleJoinCommunity = async (communityId: string) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase.from('community_members').select('id').eq('community_id', communityId).eq('user_id', user.id).maybeSingle();
      if(existing) { toast.info("Already a member"); return; }
      const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id, role: 'member' });
      if (error) throw error;
      await supabase.rpc('increment_community_members', { community_id: communityId });
      toast.success("Joined community!");
      fetchSpotlightData();
    } catch (e: any) { toast.error(e.message || "Failed to join"); }
  };

  const handleRSVP = async (eventId: string) => {
    if (!user) return;
    try {
      const event = events.find(e => e.id === eventId);
      if(event?.is_attending) {
        await supabase.from('event_attendees').delete().match({ event_id: eventId, user_id: user.id });
        await supabase.rpc('decrement_event_attendees', { event_id: eventId });
        toast.success("RSVP Cancelled");
      } else {
        await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id, status: 'confirmed' });
        await supabase.rpc('increment_event_attendees', { event_id: eventId });
        toast.success("RSVP Confirmed");
      }
      fetchSpotlightData();
    } catch (e: any) { toast.error("Failed to RSVP"); }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const data = await response.json();
                    setLocationData(data.address.city ? `${data.address.city}, ${data.address.country}` : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                    toast.success("Location added");
                } catch { setLocationData(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`); }
            },
            () => toast.error("Could not get location")
        );
    }
  };

  const handleConnect = async (targetId: string) => {
    await supabase.from('friendships').insert({ requester_id: user?.id, addressee_id: targetId });
    setSentRequests(prev => [...prev, targetId]);
    toast.success("Request sent");
  };

  const openComments = async (postId: string) => {
    setActiveCommentPost(postId);
    const { data } = await supabase.from('post_comments').select('*, profiles:user_id(display_name, avatar_url)').eq('post_id', postId).order('created_at', { ascending: true });
    setPostComments(data || []);
  };

  const submitComment = async () => {
    if (!activeCommentPost || !commentText.trim() || !user) return;
    const { data, error } = await supabase.from('post_comments').insert({
        post_id: activeCommentPost, user_id: user.id, content: commentText.trim()
    }).select('*, profiles:user_id(display_name, avatar_url)').single();
    
    if (!error) {
        await supabase.rpc('increment_post_comments', { post_id: activeCommentPost });
        setPostComments(prev => [...prev, data]);
        setCommentText("");
    }
  };

  // Filter
  const filteredPosts = feedPosts.filter(p => p.content?.toLowerCase().includes(searchQuery.toLowerCase()) || p.profiles.display_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredCommunities = communities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container-mobile py-4 space-y-4">
        
        {/* STORY TRAY */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 pt-2">
          <div className="flex gap-4 items-start">
            {/* My Story */}
            {(() => {
              const myStory = storyUsers.find(u => u.user_id === user?.id);
              return (
                <div className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group"
                  onClick={() => myStory ? setSelectedStory({ id: myStory.user_id, user_id: myStory.user_id, display_name: myStory.display_name, avatar_url: myStory.avatar_url }) : storyFileRef.current?.click()}>
                  <input type="file" ref={storyFileRef} className="hidden" accept="image/*,video/*" onChange={handleStoryFileSelect} />
                  <div className={`w-16 h-16 rounded-full p-[3px] ${myStory ? 'bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400' : 'border-2 border-dashed border-muted-foreground/30'} relative`}>
                    <img src={currentUserProfile?.avatar_url || '/default-avatar.png'} className="w-full h-full rounded-full object-cover" />
                    {!myStory && <div className="absolute inset-0 flex items-center justify-center bg-background/20 rounded-full"><Plus className="w-3 h-3 text-white" /></div>}
                  </div>
                  <span className="text-xs font-bold truncate max-w-[70px]">Your Story</span>
                </div>
              );
            })()}
            {/* Other Stories */}
            {storyUsers.filter(u => u.user_id !== user?.id).map(u => (
              <div key={u.user_id} className="flex flex-col items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => setSelectedStory({ id: u.user_id, user_id: u.user_id, display_name: u.display_name, avatar_url: u.avatar_url })}>
                <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-orange-500 to-purple-600">
                  <img src={u.avatar_url || '/default-avatar.png'} className="w-full h-full rounded-full object-cover border-2 border-background" />
                </div>
                <span className="text-xs font-medium truncate max-w-[70px]">{u.display_name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Header & Search */}
        <div className="pb-1"><h1 className="text-lg font-bold">Social Feed</h1><p className="text-xs text-muted-foreground">What's happening around you</p></div>
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search posts, communities, events..." className="pl-9 pr-12 bg-muted/50 border-0 h-11 rounded-xl" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-9 w-9 text-muted-foreground hover:text-primary"><SlidersHorizontal className="w-4 h-4" /></Button>
        </div>

        {/* TABS */}
        <Tabs defaultValue="feed" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl mb-4">
                <TabsTrigger value="feed" className="rounded-lg">Feed</TabsTrigger>
                <TabsTrigger value="spotlight" className="rounded-lg">Spotlight</TabsTrigger>
            </TabsList>

            <TabsContent value="feed" className="space-y-4">
                {/* Create Post */}
                <Card className="border-0 shadow-sm bg-card/50 relative">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex gap-3">
                      <Avatar className="w-10 h-10"><AvatarImage src={currentUserProfile?.avatar_url || undefined} /><AvatarFallback>U</AvatarFallback></Avatar>
                      <Textarea placeholder="What's on your mind? Type @ to tag friends" value={postText} onChange={(e) => setPostText(e.target.value)} className="min-h-[80px] bg-transparent border-0 resize-none focus-visible:ring-0 p-0 text-base" />
                    </div>
                    {postMedia && <div className="relative rounded-xl overflow-hidden bg-black/5"><button onClick={() => setPostMedia(null)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white"><X className="w-4 h-4" /></button>{postMedia.type === 'video' ? <video src={postMedia.url} controls className="max-h-60 w-full object-contain" /> : <img src={postMedia.url} className="max-h-60 w-full object-cover" />}</div>}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex gap-1 items-center">
                        <input type="file" ref={postFileInputRef} className="hidden" accept="image/*,video/*" onChange={handlePostMediaSelect} />
                        <Button variant="ghost" size="sm" onClick={() => postFileInputRef.current?.click()} className="text-muted-foreground"><ImageIcon className="w-5 h-5 mr-2 text-green-500" /> Photo/Video</Button>
                        <Button variant="ghost" size="sm" onClick={getLocation} className={locationData ? "text-blue-500" : "text-muted-foreground"}><MapPin className="w-5 h-5" /></Button>
                      </div>
                      <Button size="sm" onClick={handleCreatePost} disabled={uploadingPost} className="bg-primary text-white rounded-full px-6">{uploadingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Feed List */}
                <div className="space-y-4">
                  {postsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : filteredPosts.length === 0 ? <div className="text-center py-12 text-muted-foreground">No posts found.</div> : (
                    filteredPosts.map((post) => (
                      <Card key={post.id} className="border-0 shadow-sm overflow-hidden">
                        <CardHeader className="p-4 flex flex-row items-start gap-3 space-y-0">
                          <div className="cursor-pointer" onClick={() => setPreviewProfile({ user_id: post.user_id })}><Avatar><AvatarImage src={post.profiles?.avatar_url} /><AvatarFallback>{post.profiles?.display_name?.[0]}</AvatarFallback></Avatar></div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate flex items-center cursor-pointer" onClick={() => setPreviewProfile({ user_id: post.user_id })}>{post.profiles?.display_name}<VerifiedBadge userId={post.user_id} /></p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{formatDistanceToNow(new Date(post.created_at!), { addSuffix: true })}</span>{post.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {post.location}</span>}</div>
                          </div>
                          
                          {post.user_id !== user?.id && (
                              myFriends.includes(post.user_id) ? 
                              <Button size="sm" variant="ghost" className="text-blue-600 h-8" onClick={() => navigate(`/app/messages?userId=${post.user_id}`)}><MessageCircle className="w-4 h-4 mr-1" /> Message</Button> :
                              sentRequests.includes(post.user_id) ? <Button size="sm" variant="ghost" disabled className="text-muted-foreground h-8"><Check className="w-4 h-4 mr-1" /> Sent</Button> :
                              <Button size="sm" variant="outline" className="h-8" onClick={() => handleConnect(post.user_id)}><UserPlus className="w-4 h-4 mr-1" /> Connect</Button>
                          )}
                          <DropdownMenu>
                              <DropdownMenuTrigger><MoreVertical className="w-5 h-5 text-muted-foreground" /></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  {post.user_id === user?.id && <DropdownMenuItem className="text-red-600" onClick={() => deletePost(post.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>}
                              </DropdownMenuContent>
                          </DropdownMenu>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                          {post.image_url && <div className="rounded-xl overflow-hidden bg-muted">{post.post_type === 'video' ? <video src={post.image_url} controls className="w-full max-h-[500px] object-contain" /> : <img src={post.image_url} alt="Post" className="w-full h-auto object-cover" />}</div>}
                        </CardContent>
                        <CardFooter className="p-2 border-t flex justify-between">
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => likePost({ postId: post.id, isLiked: post.is_liked_by_user || false })}><Heart className={`w-5 h-5 mr-2 ${post.is_liked_by_user ? 'text-red-500 fill-red-500' : ''}`} /> {post.likes_count || 0}</Button>
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => openComments(post.id)}><MessageCircle className="w-5 h-5 mr-2" /> {post.comments_count || 0}</Button>
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setSharePost(post)}><Share2 className="w-5 h-5 mr-2" /> Share</Button>
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
            </TabsContent>

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
                                    <Avatar className="h-14 w-14 rounded-xl"><AvatarImage src={c.avatar_url!} className="object-cover" /><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-base truncate">{c.name}</h3>
                                        <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                                        <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium"><Users className="w-3 h-3" /> {c.member_count} members</div>
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
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {e.location}</p>
                                    <Button className="w-full mt-3 rounded-full" size="sm" variant="outline">View Details</Button>
                                </div>
                            </Card>
                        ))}
                    </TabsContent>
                </Tabs>
            </TabsContent>
        </Tabs>
      </div>

      {/* MODALS & DIALOGS */}
      <Dialog open={!!storyPreview} onOpenChange={() => setStoryPreview(null)}>
        <DialogContent className="sm:max-w-[480px] bg-background border-0">
          <DialogHeader><DialogTitle>Create Story</DialogTitle></DialogHeader>
          <div className="h-[40vh] bg-black/10 rounded-xl overflow-hidden flex items-center justify-center relative">
            {storyPreview && (storyPreview.file.type.startsWith('video') ? <video src={storyPreview.url} controls className="h-full" /> : <img src={storyPreview.url} className="h-full object-contain" />)}
          </div>
          <div className="space-y-4">
            <Input placeholder="Add a caption..." value={storyCaption} onChange={e => setStoryCaption(e.target.value)} />
            <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setStoryPreview(null)}>Cancel</Button>
                <Button onClick={handleStoryUpload} disabled={uploadingStory}>{uploadingStory ? 'Uploading...' : 'Share Story'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {selectedStory && <StoryViewer user={selectedStory} onClose={() => setSelectedStory(null)} onStoryChange={fetchStories} />}

      <Dialog open={!!activeCommentPost} onOpenChange={() => setActiveCommentPost(null)}>
        <DialogContent className="sm:max-w-[500px] h-[70vh] flex flex-col">
            <DialogHeader><DialogTitle>Comments</DialogTitle></DialogHeader>
            <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                    {postComments.map(c => (
                        <div key={c.id} className="flex gap-3">
                            <Avatar className="w-8 h-8"><AvatarImage src={c.profiles?.avatar_url} /><AvatarFallback>U</AvatarFallback></Avatar>
                            <div className="bg-muted/50 p-3 rounded-xl rounded-tl-none flex-1">
                                <p className="text-xs font-bold mb-1">{c.profiles?.display_name}</p>
                                <p className="text-sm">{c.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
            <div className="flex gap-2 pt-2 border-t">
                <Input placeholder="Write a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} />
                <Button size="icon" onClick={submitComment}><Send className="w-4 h-4" /></Button>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sharePost} onOpenChange={() => setSharePost(null)}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Share to...</DialogTitle></DialogHeader>
              <ScrollArea className="h-60">
                  {friends.map(f => (
                      <div key={f.user_id} className="flex items-center justify-between p-3 hover:bg-muted rounded-lg cursor-pointer" onClick={() => handleShareToDM(f.user_id)}>
                          <div className="flex items-center gap-3"><Avatar><AvatarImage src={f.avatar_url}/></Avatar><span>{f.display_name}</span></div>
                          <Send className="w-4 h-4 text-muted-foreground" />
                      </div>
                  ))}
                  {friends.length === 0 && <p className="text-center text-muted-foreground py-4">No friends found.</p>}
              </ScrollArea>
          </DialogContent>
      </Dialog>

      <FriendProfilePreview profile={previewProfile} open={!!previewProfile} onClose={() => setPreviewProfile(null)} />

      {/* ✅ INTEGRATED MODALS FOR SPOTLIGHT */}
      <EventDetailModal event={selectedEvent} isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} onRSVP={handleRSVP} />
      <CommunityDetailModal community={selectedCommunity} isOpen={!!selectedCommunity} onClose={() => setSelectedCommunity(null)} onJoin={handleJoinCommunity} onOpen={() => navigate('/app/messages?tab=community')} />
    </div>
  );
};

export default Feed;