import React, { useState, useEffect, memo } from 'react';
import { ExternalLink, Globe, Loader2 } from 'lucide-react';

interface UrlPreviewProps {
  url: string;
  className?: string;
}

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Extract URLs from text
export const extractUrls = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  return text.match(urlRegex) || [];
};

// Render text with clickable links
export const renderTextWithLinks = (text: string, className?: string): React.ReactNode => {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0; // Reset regex state
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`underline hover:opacity-80 break-all ${className || ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export const UrlPreview = memo(function UrlPreviewInner({ url, className }: UrlPreviewProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Basic URL validation
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        // For known domains, we can show a basic preview without fetching
        const knownDomains: Record<string, { siteName: string; icon?: string }> = {
          'youtube.com': { siteName: 'YouTube' },
          'youtu.be': { siteName: 'YouTube' },
          'twitter.com': { siteName: 'Twitter' },
          'x.com': { siteName: 'X (Twitter)' },
          'instagram.com': { siteName: 'Instagram' },
          'facebook.com': { siteName: 'Facebook' },
          'linkedin.com': { siteName: 'LinkedIn' },
          'github.com': { siteName: 'GitHub' },
          'tiktok.com': { siteName: 'TikTok' },
          'reddit.com': { siteName: 'Reddit' },
          'spotify.com': { siteName: 'Spotify' },
          'open.spotify.com': { siteName: 'Spotify' },
        };
        
        const knownDomain = knownDomains[domain];
        
        setPreview({
          title: urlObj.pathname.length > 1 
            ? decodeURIComponent(urlObj.pathname.slice(1).replace(/[-_]/g, ' ')).slice(0, 50)
            : knownDomain?.siteName || domain,
          siteName: knownDomain?.siteName || domain,
          url: url,
        });
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [url]);

  if (error) return null;

  if (loading) {
    return (
      <div className={`flex items-center gap-2 p-2 bg-background/50 rounded-lg border border-border/50 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading preview...</span>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block mt-2 p-3 bg-background/80 rounded-xl border border-border/60 hover:bg-background transition-colors group ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
          <Globe className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
            {preview.title || preview.siteName}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {preview.siteName}
          </p>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
});

UrlPreview.displayName = 'UrlPreview';
