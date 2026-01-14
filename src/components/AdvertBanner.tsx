import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AdvertData {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string;
  is_active: boolean;
  placement: string;
}

const AD_ROTATION_INTERVAL = 8000; // 8 seconds

export const AdvertBanner = () => {
  const { user } = useAuth();
  const [adverts, setAdverts] = useState<AdvertData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkPremiumAndFetchAds = async () => {
      // Check if user has premium (full_package removes all ads)
      const { data: premiumData } = await supabase
        .from('premium_features')
        .select('feature_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('feature_type', 'full_package')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      const hasPremium = !!premiumData || !!subData;
      setIsPremium(hasPremium);

      // Only fetch ads if not premium
      if (!hasPremium) {
        const { data: advertData } = await supabase
          .from('advertisements')
          .select('*')
          .eq('is_active', true)
          .eq('placement', 'bottom_banner')
          .order('created_at', { ascending: false })
          .limit(5);

        if (advertData && advertData.length > 0) {
          setAdverts(advertData);
        }
      }
    };

    checkPremiumAndFetchAds();
  }, [user]);

  // Auto-rotate ads
  useEffect(() => {
    if (adverts.length <= 1) return;

    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % adverts.length);
        setIsAnimating(false);
      }, 200);
    }, AD_ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [adverts.length]);

  const handlePrev = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev - 1 + adverts.length) % adverts.length);
      setIsAnimating(false);
    }, 200);
  }, [adverts.length]);

  const handleNext = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % adverts.length);
      setIsAnimating(false);
    }, 200);
  }, [adverts.length]);

  if (isPremium || adverts.length === 0 || !isVisible) return null;

  const currentAd = adverts[currentIndex];

  return (
    <Card className="fixed bottom-16 left-2 right-2 z-40 mb-2 border-primary/20 shadow-xl bg-card/95 backdrop-blur-md overflow-hidden">
      <div className="relative">
        {/* Close button */}
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 p-1.5 hover:bg-muted rounded-full transition-colors z-10 bg-background/80 backdrop-blur-sm"
          aria-label="Close advertisement"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        {/* Ad content */}
        <a
          href={currentAd.link_url}
          rel="noopener noreferrer"
          target="_blank"
          className={cn(
            "flex items-center gap-3 p-3 group transition-opacity duration-200",
            isAnimating && "opacity-50"
          )}
        >
          {currentAd.image_url && (
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border/50">
              <img
                src={currentAd.image_url}
                alt={currentAd.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
          )}

          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-2 mb-0.5">
              <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                {currentAd.title}
              </h4>
              <span className="text-[8px] text-muted-foreground uppercase tracking-wider bg-muted/80 px-1.5 py-0.5 rounded font-medium">
                Ad
              </span>
            </div>
            {currentAd.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                {currentAd.description}
              </p>
            )}
          </div>

          <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </a>

        {/* Navigation dots for multiple ads */}
        {adverts.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-2">
            {adverts.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentIndex(index);
                }}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  index === currentIndex 
                    ? "bg-primary w-3" 
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to ad ${index + 1}`}
              />
            ))}
          </div>
        )}

        {/* Navigation arrows for multiple ads */}
        {adverts.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.preventDefault();
                handlePrev();
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-1 hover:bg-muted/50 rounded-r transition-colors"
              aria-label="Previous ad"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                handleNext();
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 p-1 hover:bg-muted/50 rounded-l transition-colors"
              aria-label="Next ad"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </>
        )}
      </div>
    </Card>
  );
};
