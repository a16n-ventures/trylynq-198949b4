import React, { useState, useEffect, memo } from 'react';
import { ExternalLink, Globe, Loader2, Link as LinkIcon } from 'lucide-react';

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

// Robust URL extraction regex
export const extractUrls = (text: string): string[] => {
  if (!text) return [];
  // Matches http/https URLs, handling query params and common punctuation ending a sentence
  const urlRegex = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/[^\s]+)/gi;
  return text.match(urlRegex) || [];
};

// Render text with clickable links
export const renderTextWithLinks = (text: string, className?: string): React.ReactNode => {
  if (!text) return null;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      // Ensure protocol exists for href
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a 
          key={index} 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={`underline hover:opacity-80 break-all cursor-pointer ${className || ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

export const UrlPreview = memo(function UrlPreviewInner({ url, className }: UrlPreviewProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchPreview = async () => {
      if (!url) {
        if (isMounted) setError(true);
        return;
      }

      try {
        setLoading(true);
        setError(false);
        
        // Basic URL validation
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = urlObj.hostname.replace('www.', '');
        
        // --- Simulated Metadata Fetching ---
        // In a real production app, this would call an Edge Function (e.g., Supabase Edge Function)
        // that uses 'cheerio' or 'puppeteer' to scrape OG tags to avoid CORS issues.
        // For this frontend-only snippet, we use a heuristics dictionary for instant results.
        
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
          'twitch.tv': { siteName: 'Twitch' },
          'discord.com': { siteName: 'Discord' },
        };
        
        // Check for fuzzy match on domain
        const knownKey = Object.keys(knownDomains).find(k => domain.includes(k));
        const knownDomain = knownKey ? knownDomains[knownKey] : null;
        
        // Simulate network delay for realism/skeleton check
        // await new Promise(r => setTimeout(r, 500)); 

        if (isMounted) {
          setPreview({
            title: urlObj.pathname.length > 1 
              ? decodeURIComponent(urlObj.pathname.slice(1).replace(/[-_]/g, ' ')).slice(0, 60)
              : (knownDomain?.siteName || domain),
            description: domain,
            siteName: knownDomain?.siteName || domain,
            url: url,
          });
        }
      } catch (e) {
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPreview();

    return () => { isMounted = false; };
  }, [url]);

  if (error) return null;

  if (loading) {
    return (
      <div className={`flex items-center gap-3 p-3 mt-2 bg-muted/40 rounded-xl border border-border/40 w-full max-w-sm animate-pulse ${className}`}>
        <div className="w-10 h-10 bg-muted-foreground/10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted-foreground/10 rounded w-3/4" />
          <div className="h-2 bg-muted-foreground/10 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`
        block mt-2 p-3 bg-card/50 hover:bg-card/80 transition-all 
        rounded-xl border border-border/50 group max-w-sm overflow-hidden
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-muted/50 rounded-lg flex items-center justify-center flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors border border-border/20">
          <Globe className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors break-words">
            {preview.title || "Link Preview"}
          </h4>
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
             <LinkIcon className="w-3 h-3" />
            {preview.siteName}
          </p>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
      </div>
    </a>
  );
});

UrlPreview.displayName = 'UrlPreview';
