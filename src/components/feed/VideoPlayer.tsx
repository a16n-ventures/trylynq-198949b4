import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  className?: string;
  posterUrl?: string;
  aspectRatio?: 'video' | 'square' | 'portrait';
}

// Instagram-style video player with autoplay on scroll
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
  const [showControls, setShowControls] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Intersection Observer for autoplay when visible
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setIsVisible(true);
            video.play().catch(() => {
              // Autoplay failed - likely due to browser policy
              setIsPlaying(false);
            });
          } else {
            setIsVisible(false);
            video.pause();
          }
        });
      },
      { threshold: [0.6] }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Update playing state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

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
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * video.duration;
  }, []);

  const handleShowControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const aspectClass = {
    video: 'aspect-video',
    square: 'aspect-square',
    portrait: 'aspect-[9/16]'
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

      {/* Play/Pause Overlay */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-300",
          (showControls || !isPlaying) ? "opacity-100" : "opacity-0"
        )}
      >
        {!isPlaying && (
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-4 shadow-lg">
            <Play className="w-8 h-8 text-white fill-white" />
          </div>
        )}
      </div>

      {/* Mute Button */}
      <button
        onClick={toggleMute}
        className={cn(
          "absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-sm rounded-full text-white transition-opacity duration-300 hover:bg-black/80",
          (showControls || !isPlaying) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        {isMuted ? (
          <VolumeX className="w-5 h-5" />
        ) : (
          <Volume2 className="w-5 h-5" />
        )}
      </button>

      {/* Progress Bar */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 h-1 bg-white/20 cursor-pointer transition-all",
          showControls ? "h-2" : "h-1"
        )}
        onClick={(e) => { e.stopPropagation(); handleSeek(e); }}
      >
        <div 
          className="h-full bg-white transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Live indicator for autoplaying content */}
      {isVisible && isPlaying && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-full">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white text-xs font-medium">Playing</span>
        </div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
