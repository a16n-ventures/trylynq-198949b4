import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  X, Heart, Send, Share2, MoreVertical, Trash2, Copy, Eye, 
  Loader2, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

interface Story {
  id: string;
  content: string | null;
  created_at: string;
  author_id: string | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | string | null;
  view_count?: number;
}

interface Profile {
  id: string;
  user_id?: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StoryViewerProps {
  user: Profile;
  onClose: () => void;
  onStoryChange?: () => void;
}

const STORY_DURATION = 5000; // 5 seconds per story

export function InstagramStoryViewer({ user, onClose, onStoryChange }: StoryViewerProps) {
  const { user: currentUser } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [message, setMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);

  const targetId = user.user_id || user.id;
  const isMyStory = currentUser?.id === targetId;

  // Check premium status for verified badge
  const { data: isVerified } = useQuery({
    queryKey: ['story-author-premium', targetId],
    queryFn: async () => {
      if (!targetId) return false;
      const { data: pf } = await supabase.from('premium_features').select('is_active').eq('user_id', targetId).eq('is_active', true).gt('expires_at', new Date().toISOString()).maybeSingle();
      const { data: sub } = await supabase.from('subscriptions').select('status').eq('user_id', targetId).eq('status', 'active').maybeSingle();
      return !!pf || !!sub;
    },
    enabled: !!targetId
  });

  // Load stories
  useEffect(() => {
    const load = async () => {
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
  }, [targetId, onClose]);

  const current = stories[currentIndex];

  // Progress bar animation
  useEffect(() => {
    if (!current || isPaused || loading) return;

    const isVideo = current.media_type === 'video';
    const duration = isVideo && videoRef.current ? (videoRef.current.duration * 1000) || STORY_DURATION : STORY_DURATION;
    const step = 100 / (duration / 50);

    setProgress(0);
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + step;
      });
    }, 50);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [currentIndex, isPaused, loading, current]);

  // Record view
  useEffect(() => {
    if (!current || !currentUser || isMyStory) return;

    const viewKey = `story-view-${current.id}-${currentUser.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      supabase.rpc('increment_story_view', { story_id: current.id, viewer_id: currentUser.id });
      sessionStorage.setItem(viewKey, 'true');
    }
  }, [current?.id, currentUser, isMyStory]);

  // Realtime updates
  useEffect(() => {
    if (!current) return;

    const channel = supabase.channel(`story-${current.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stories', filter: `id=eq.${current.id}` }, (payload: any) => {
        if (payload.new.view_count !== undefined) setViewCount(payload.new.view_count);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_likes', filter: `story_id=eq.${current.id}` }, (payload) => {
        if (payload.new.user_id !== currentUser?.id) {
          spawnHeart();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [current?.id, currentUser?.id]);

  const spawnHeart = () => {
    const id = Date.now();
    const x = Math.random() * 60 + 20;
    const y = Math.random() * 20 + 70;
    setHearts(prev => [...prev, { id, x, y }]);
    setTimeout(() => setHearts(prev => prev.filter(h => h.id !== id)), 2000);
  };

  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(i => i + 1);
      setLiked(false);
      setProgress(0);
      if (stories[currentIndex + 1]) {
        setViewCount(stories[currentIndex + 1].view_count || 0);
      }
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setLiked(false);
      setProgress(0);
      if (stories[currentIndex - 1]) {
        setViewCount(stories[currentIndex - 1].view_count || 0);
      }
    }
  }, [currentIndex, stories]);

  const handleLike = async () => {
    if (!current || !currentUser || liked) return;
    setLiked(true);
    spawnHeart();
    await supabase.from('story_likes').insert({ story_id: current.id, user_id: currentUser.id });
  };

  const handleSendReply = async () => {
    if (!message.trim() || !currentUser || !current) return;
    setSendingReply(true);
    try {
      await supabase.from('messages').insert({
        sender_id: currentUser.id,
        receiver_id: targetId,
        content: `💬 Replied to your story: ${message}`,
      });
      toast.success('Reply sent!');
      setMessage('');
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async () => {
    if (!current || !currentUser || !confirm('Delete this story?')) return;
    
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
      setCurrentIndex(Math.min(currentIndex, newStories.length - 1));
      onStoryChange?.();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    setIsPaused(false);
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToPrev();
      else goToNext();
    }
  };

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;

    if (x < third) goToPrev();
    else if (x > third * 2) goToNext();
    else setIsPaused(p => !p);
  };

  if (loading || !current) return null;

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md w-full p-0 border-0 bg-transparent shadow-none h-[100dvh] sm:h-[90vh] flex items-center justify-center">
        <div 
          className="relative w-full h-full max-h-[800px] bg-black rounded-2xl overflow-hidden flex flex-col shadow-2xl"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleTap}
        >
          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 p-2">
            {stories.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-100 ease-linear"
                  style={{ 
                    width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%' 
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-8 left-0 right-0 z-30 flex items-center gap-3 px-4 py-2 bg-gradient-to-b from-black/60 via-black/30 to-transparent">
            <Avatar className="w-10 h-10 ring-2 ring-white/20">
              <AvatarImage src={user.avatar_url || '/default-avatar.png'} />
              <AvatarFallback>{user.display_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm flex items-center gap-1 truncate">
                {isMyStory ? 'Your Story' : user.display_name}
                {isVerified && (
                  <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 22 22" fill="currentColor">
                    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                  </svg>
                )}
              </p>
              <p className="text-white/60 text-xs">
                {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
              </p>
            </div>

            {/* Pause indicator */}
            {isPaused && (
              <div className="px-2 py-1 bg-white/20 rounded-full">
                <Pause className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Actions menu for own stories */}
            {isMyStory && (
              <button 
                onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} 
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-white" />
              </button>
            )}

            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Actions dropdown */}
          {isMyStory && showActions && (
            <div 
              className="absolute top-20 right-4 z-40 bg-black/95 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={handleDelete} 
                className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-3"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-medium">Delete Story</span>
              </button>
              <button 
                onClick={() => { 
                  navigator.clipboard.writeText(current.media_url || window.location.href); 
                  toast.success('Copied!'); 
                  setShowActions(false);
                }} 
                className="w-full px-4 py-3 text-left text-white hover:bg-white/10 flex items-center gap-3"
              >
                <Copy className="w-4 h-4" />
                <span className="text-sm font-medium">Copy Link</span>
              </button>
            </div>
          )}

          {/* Floating hearts */}
          {hearts.map(h => (
            <div 
              key={h.id}
              className="absolute text-3xl animate-float-up pointer-events-none z-50"
              style={{ left: `${h.x}%`, bottom: `${h.y}%` }}
            >
              ❤️
            </div>
          ))}

          {/* Story content */}
          <div className="flex-1 flex items-center justify-center relative">
            {current.media_url ? (
              current.media_type === 'video' ? (
                <div className="w-full h-full relative">
                  <video
                    ref={videoRef}
                    src={current.media_url}
                    className="w-full h-full object-contain"
                    autoPlay
                    loop
                    muted={isMuted}
                    playsInline
                    onLoadedMetadata={() => {
                      if (videoRef.current && isPaused) {
                        videoRef.current.pause();
                      }
                    }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                    className="absolute bottom-24 right-4 p-2.5 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <img 
                  src={current.media_url} 
                  alt="Story" 
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              )
            ) : (
              <div className="px-8 py-16 text-center">
                <p className="text-white text-xl leading-relaxed font-medium">
                  {current.content}
                </p>
              </div>
            )}

            {/* Caption overlay */}
            {current.media_url && current.content && (
              <div className="absolute bottom-28 left-0 right-0 px-6">
                <p className="text-white text-center text-sm bg-black/40 backdrop-blur-sm rounded-2xl py-3 px-4">
                  {current.content}
                </p>
              </div>
            )}
          </div>

          {/* Navigation arrows (desktop) */}
          {currentIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToPrev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors hidden sm:flex"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          )}
          {currentIndex < stories.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors hidden sm:flex"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Footer */}
          {!isMyStory ? (
            <div 
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-3 z-30"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative flex-1">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Send a message..."
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-full pr-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white hover:bg-white/10"
                  onClick={handleSendReply}
                  disabled={sendingReply || !message.trim()}
                >
                  {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>

              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "text-white hover:bg-white/10 rounded-full h-10 w-10 transition-transform active:scale-110",
                  liked && "text-red-500"
                )}
                onClick={handleLike}
              >
                <Heart className={cn("w-6 h-6", liked && "fill-red-500")} />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/10 rounded-full h-10 w-10"
                onClick={() => toast.info('Share coming soon!')}
              >
                <Share2 className="w-6 h-6" />
              </Button>
            </div>
          ) : (
            <div 
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-black/60 backdrop-blur-sm px-5 py-2.5 rounded-full flex items-center gap-2.5 border border-white/10">
                <Eye className="w-4 h-4 text-white/70" />
                <span className="text-white text-sm font-medium">{viewCount} views</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
