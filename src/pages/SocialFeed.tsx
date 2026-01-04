import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Heart, MessageCircle, Share, MapPin, Calendar, Users, Plus, 
  Image, Video, X, Loader2, MoreVertical, Trash2, Copy, Eye, Share2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from "date-fns";
import { useQuery } from '@tanstack/react-query';

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
type ProfileWithStoryInner = { id: string; display_name: string | null; avatar_url: string | null; stories: Story[]; };

// --- VERIFIED BADGE COMPONENT ---
const VerifiedBadge = () => (
  <svg 
    className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

// --- STORY VIEWER COMPONENT ---
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

  // Check for verified/premium status for the story author
  const { data: isVerified } = useQuery({
    queryKey: ['story-author-premium', user.id],
    queryFn: async () => {
      const { data: premiumFeature } = await supabase
        .from('premium_features')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      return !!premiumFeature || !!sub;
    },
    enabled: !!user.id
  });

  useEffect(() => {
    const load = async () => {
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
        onClose(); 
      }
      setLoading(false);
    };
    load();
  }, [user.id]);

  const current = stories[index];
  const isMyStory = currentUser?.id === user.id; 
  
  // Realtime Logic
  useEffect(() => {
    if (!current || !currentUser) return;

    if (!isMyStory) {
      const viewKey = `story-view-${current.id}-${currentUser.id}`;
      const hasViewed = sessionStorage.getItem(viewKey);

      if (!hasViewed) {
        const recordView = async () => {
          await supabase.rpc('increment_story_view', { story_id: current.id, viewer_id: currentUser.id });
          sessionStorage.setItem(viewKey, 'true');
        };
        recordView();
      }
    }

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
    setIncomingHearts(prev => [...prev, { id: Date.now(), left: 50 }]);
    
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
        onStoryChange?.();
      } else {
        const newStories = stories.filter(s => s.id !== current.id);
        setStories(newStories);
        if (index >= newStories.length) {
          setIndex(Math.max(0, newStories.length - 1));
        }
        onStoryChange?.(); 
      }
      
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete story');
    }
  };

  const handleShareToDM = () => {
    toast.info('Share to DM - Coming soon!');
  };

  if (loading) return null;
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
              <span className="text-white font-bold text-sm drop-shadow-md flex items-center gap-1">
                {isMyStory ? 'Your Story' : (user.display_name || 'User')}
                {isVerified && !isMyStory && <VerifiedBadge />}
              </span>
              <span className="text-white/70 text-xs block">
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

// --- MAIN SOCIAL FEED COMPONENT ---
const SocialFeed = () => {
  const { user } = useAuth();
  const [postText, setPostText] = useState('');
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Story States
  const [storyUsers, setStoryUsers] = useState<ProfileWithStoryInner[]>([]);
  const [selectedStory, setSelectedStory] = useState<Profile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [storiesLoading, setStoriesLoading] = useState(true);
  
  // Upload State
  const [preview, setPreview] = useState<{ file: File, url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPosts();
    fetchStories();
    
    // Fetch current user profile for the story bubble
    if (user) {
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setCurrentUserProfile({ id: data.id, display_name: data.display_name, avatar_url: data.avatar_url });
          }
        });
    }
  }, [user]);

  // --- STORY FUNCTIONS ---
  const fetchStories = async () => {
    if (!user) return;
    setStoriesLoading(true);
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
      profiles?.forEach((p: any) => profileMap.set(p.user_id, p));

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
    
      setStoryUsers(Array.from(storyMap.values()));
    } else {
      setStoryUsers([]);
    }
    setStoriesLoading(false);
  };

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
          view_count: 0
        });
      
      if (insertError) throw insertError;
      
      toast.success("Story posted! 📸");
      setPreview(null);
      setCaption("");
      await fetchStories(); // Refresh without reload
      
    } catch (e: any) {
      console.error("Story upload error:", e);
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // --- POST FUNCTIONS ---
  const fetchPosts = async () => {
    try {
      const { data: posts, error } = await supabase
        .from('social_posts')
        .select(`
          *,
          profiles!social_posts_user_id_fkey (
            display_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setFeedPosts(posts || []);
    } catch (error) {
      console.error('Fetch posts error:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!postText.trim()) {
      toast.error('Please write something');
      return;
    }

    try {
      const { error } = await supabase
        .from('social_posts')
        .insert({
          user_id: user?.id,
          content: postText.trim(),
          post_type: 'status'
        });

      if (error) throw error;

      toast.success('Post created!');
      setPostText('');
      fetchPosts();
    } catch (error) {
      console.error('Create post error:', error);
      toast.error('Failed to create post');
    }
  };

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'event': return <Calendar className="w-4 h-4" />;
      case 'location': return <MapPin className="w-4 h-4" />;
      default: return null;
    }
  };

  const PostCard = ({ post }: { post: any }) => {
    const author = post.profiles;
    const timeAgo = new Date(post.created_at).toLocaleDateString();
    
    return (
      <Card className="gradient-card shadow-card border-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={author?.avatar_url} />
              <AvatarFallback className="gradient-primary text-white text-sm">
                {author?.display_name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{author?.display_name || 'User'}</h3>
                {post.post_type !== 'status' && (
                  <Badge variant="secondary" className="text-xs">
                    {getPostTypeIcon(post.post_type)}
                    <span className="ml-1 capitalize">{post.post_type}</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{timeAgo}</span>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <p className="text-sm">{post.content}</p>
            {post.image_url && (
              <div className="mt-3 rounded-lg overflow-hidden">
                <img src={post.image_url} alt="Post" className="w-full h-auto" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <Button variant="ghost" size="sm" className="flex-1">
              <Heart className="w-4 h-4 mr-1" /> {post.likes_count || 0}
            </Button>
            <Button variant="ghost" size="sm" className="flex-1">
              <MessageCircle className="w-4 h-4 mr-1" /> {post.comments_count || 0}
            </Button>
            <Button variant="ghost" size="sm" className="flex-1">
              <Share className="w-4 h-4 mr-1" /> 0
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container-mobile py-4 space-y-4">
        
        {/* STORY TRAY - REPLACED BANNER */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 pt-2">
          {storiesLoading ? (
            <div className="flex gap-4">
              <div className="w-16 h-16 bg-muted rounded-full animate-pulse" />
              <div className="w-16 h-16 bg-muted rounded-full animate-pulse" />
              <div className="w-16 h-16 bg-muted rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {/* My Story Bubble */}
              {(() => {
                const myStory = storyUsers.find(u => u.id === user?.id);
                const handleLongPress = (e: React.SyntheticEvent) => { e.preventDefault(); fileRef.current?.click(); };

                return (
                  <div 
                    className="flex flex-col items-center gap-2 flex-shrink-0 relative cursor-pointer group"
                    onClick={() => myStory ? setSelectedStory(myStory) : fileRef.current?.click()}
                    onContextMenu={handleLongPress}
                  >
                    <input type="file" ref={fileRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                    <div className={`w-16 h-16 rounded-full p-[3px] ${
                      myStory 
                        ? 'bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400' 
                        : 'border-2 border-dashed border-muted-foreground/30'
                    } relative group-hover:scale-105 transition-transform shadow-sm`}>
                      <img 
                        src={currentUserProfile?.avatar_url || '/default-avatar.png'} 
                        className={`w-full h-full rounded-full object-cover ${myStory ? 'border-2 border-background' : 'opacity-50'}`} 
                        alt="Your story"
                      />
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
              {storyUsers.filter(u => u.id !== user?.id).map(u => (
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
                  <span className="text-xs font-medium max-w-[70px] truncate">{u.display_name || 'User'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Header Text */}
        <div className="pb-2 border-b border-border/40">
          <h1 className="text-lg font-bold">Social Feed</h1>
          <p className="text-xs text-muted-foreground">What's happening around you</p>
        </div>

        {/* Create Post */}
        <Card className="gradient-card shadow-card border-0">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={currentUserProfile?.avatar_url || undefined} />
                <AvatarFallback className="gradient-primary text-white">U</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <Textarea
                  placeholder="What's on your mind?"
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm"><Image className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm"><Video className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm"><MapPin className="w-4 h-4" /></Button>
                  </div>
                  <Button size="sm" className="gradient-primary text-white" onClick={handleCreatePost}>Post</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feed Posts */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Loading feed...</p>
            </div>
          ) : feedPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No posts yet. Be the first to share!</p>
            </div>
          ) : (
            feedPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          )}
        </div>
      </div>

      {/* Upload Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto bg-background/95 backdrop-blur-xl border-0">
          <DialogHeader><DialogTitle>Create Story</DialogTitle></DialogHeader>
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
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : <><Loader2 className="w-4 h-4 mr-2" /> Share</>}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Story Viewer */}
      {selectedStory && <StoryViewer user={selectedStory} onClose={() => setSelectedStory(null)} onStoryChange={fetchStories} />}
    </div>
  );
};

export default SocialFeed;