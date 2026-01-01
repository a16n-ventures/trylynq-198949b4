import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PremiumFeatureType = 
  | 'full_package' 
  | 'profile_boost' 
  | 'event_boost' 
  | 'profile_badge';

interface PremiumFeature {
  feature_type: PremiumFeatureType;
  expires_at: string;
  is_active: boolean;
}

/**
 * Hook to check if a user has active premium features
 * Returns whether user has premium badge, full package, or any active premium
 */
export const usePremiumStatus = (userId?: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['premium-status', userId],
    queryFn: async () => {
      if (!userId) return { isPremium: false, hasBadge: false, features: [] };

      // Get all active premium features for the user
      const { data: features, error: featuresError } = await supabase
        .from('premium_features')
        .select('feature_type, expires_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString());

      if (featuresError) {
        console.error('Error fetching premium features:', featuresError);
        return { isPremium: false, hasBadge: false, features: [] };
      }

      const activeFeatures = (features || []) as PremiumFeature[];
      
      // Check if user has full package (gives access to everything)
      const hasFullPackage = activeFeatures.some(f => f.feature_type === 'full_package');
      
      // Check if user has premium badge specifically
      const hasBadge = hasFullPackage || activeFeatures.some(f => f.feature_type === 'profile_badge');
      
      // Check if user has any active premium feature
      const isPremium = activeFeatures.length > 0;

      return {
        isPremium,
        hasBadge,
        hasFullPackage,
        hasProfileBoost: hasFullPackage || activeFeatures.some(f => f.feature_type === 'profile_boost'),
        hasEventBoost: hasFullPackage || activeFeatures.some(f => f.feature_type === 'event_boost'),
        features: activeFeatures
      };
    },
    enabled: !!userId,
    staleTime: 60000, // Cache for 1 minute
  });

  return {
    isPremium: data?.isPremium ?? false,
    hasBadge: data?.hasBadge ?? false,
    hasFullPackage: data?.hasFullPackage ?? false,
    hasProfileBoost: data?.hasProfileBoost ?? false,
    hasEventBoost: data?.hasEventBoost ?? false,
    features: data?.features ?? [],
    isLoading,
    error
  };
};

/**
 * Simple hook to just check if user has premium badge
 */
export const useHasPremiumBadge = (userId?: string) => {
  const { hasBadge, isLoading } = usePremiumStatus(userId);
  return { hasBadge, isLoading };
};
