import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  className?: string;
  posterUrl?: string;
  aspectRatio?: 'video' | 'square' | 'portrait' | 'auto';
}

/**
 * Instagram-style video player with:
 * - Autoplay on scroll visibility (60%+ visible)
 * - Muted by default (for autoplay compliance)
 * - Tap to pause/play
 * - Double-tap to like (optional callback)
 * - Custom progress bar
 * - Smooth fade animations for controls
 */
export const VideoPlayer = memo(function VideoPlayerInner({ 
  src, 
  className, 
  posterUrl,
  aspectRatio = 'video' 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);

  // Intersection Observer for autoplay when visible
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isInView = entry.isIntersecting && entry.intersectionRatio >= 0.6;
          setIsVisible(isInView);
          
          if (isInView) {
            video.play().catch(() => setIsPlaying(false));
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.3, 0.6, 1] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
        setCurrentTime(video.currentTime);
      }
    };
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBuffered((bufferedEnd / video.duration) * 100);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('progress', handleProgress);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('progress', handleProgress);
    };
  }, []);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    // Double-tap detection
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap - could trigger like
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = percent * video.duration;
  }, [duration]);

  const handleShowControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const aspectClass = {
    video: 'aspect-video',
    square: 'aspect-square',
    portrait: 'aspect-[9/16]',
    auto: ''
  }[aspectRatio];

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-xl overflow-hidden group cursor-pointer",
        aspectClass,
        className
      )}
      onClick={togglePlay}
      onMouseMove={handleShowControls}
      onTouchStart={handleShowControls}
    >
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl}
        className="w-full h-full object-contain"
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
      />

      {/* Center play/pause button */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-300",
          (showControls || !isPlaying) ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {!isPlaying && (
          <div className="bg-black/40 backdrop-blur-md rounded-full p-5 shadow-2xl transform transition-transform hover:scale-105">
            <Play className="w-10 h-10 text-white fill-white ml-1" />
          </div>
        )}
      </div>

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      {/* Bottom controls overlay */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-10 pb-3 px-3 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Progress bar */}
        <div 
          className="w-full h-1 bg-white/20 rounded-full cursor-pointer mb-2 overflow-hidden group/progress"
          onClick={handleSeek}
        >
          {/* Buffered */}
          <div 
            className="absolute h-1 bg-white/30 rounded-full transition-all"
            style={{ width: `${buffered}%` }}
          />
          {/* Progress */}
          <div 
            className="h-full bg-white rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            {/* Thumb */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Time & controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white fill-white" />
              ) : (
                <Play className="w-5 h-5 text-white fill-white" />
              )}
            </button>
            <span className="text-white text-xs font-medium tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <button
            onClick={toggleMute}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Live/Playing indicator */}
      {isVisible && isPlaying && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-full pointer-events-none">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-white text-xs font-medium">Playing</span>
        </div>
      )}

      {/* Muted indicator (shows briefly when autoplaying) */}
      {isMuted && isPlaying && showControls && (
        <div className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-sm rounded-full pointer-events-none">
          <VolumeX className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
