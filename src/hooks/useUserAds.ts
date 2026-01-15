import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserAd {
  id: string;
  user_id: string;
  post_id?: string | null;
  title: string;
  content?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  status: 'pending' | 'active' | 'rejected' | 'paused' | 'completed' | 'expired';
  goal: 'profile_visits' | 'website_clicks' | 'engagement' | 'brand_awareness';
  target_audience?: string;
  target_location?: string | null;
  daily_budget: number;
  total_budget: number;
  duration_days: number;
  impressions: number;
  clicks: number;
  engagement: number;
  start_date?: string | null;
  end_date?: string | null;
  payment_reference?: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount_paid: number;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdPayload {
  title: string;
  content?: string;
  image_url?: string;
  link_url?: string;
  goal?: string;
  target_audience?: string;
  target_location?: string;
  daily_budget: number;
  duration_days: number;
  post_id?: string;
}

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for managing user-submitted advertisements
 */
export function useUserAds(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch user's ads
  const adsQuery = useQuery({
    queryKey: ['user-ads', userId],
    queryFn: async (): Promise<UserAd[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('user_ads')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserAd[];
    },
    enabled: !!userId,
    staleTime: STALE_TIME,
  });

  // Create ad mutation
  const createAdMutation = useMutation({
    mutationFn: async (payload: CreateAdPayload) => {
      if (!userId) throw new Error('Not authenticated');

      const totalBudget = payload.daily_budget * payload.duration_days;
      const vat = totalBudget * 0.075;
      const amountToPay = totalBudget + vat;

      const { data, error } = await supabase
        .from('user_ads')
        .insert({
          user_id: userId,
          title: payload.title,
          content: payload.content || null,
          image_url: payload.image_url || null,
          link_url: payload.link_url || null,
          post_id: payload.post_id || null,
          goal: payload.goal || 'profile_visits',
          target_audience: payload.target_audience || 'all',
          target_location: payload.target_location || null,
          daily_budget: payload.daily_budget,
          total_budget: totalBudget,
          duration_days: payload.duration_days,
          amount_paid: amountToPay,
          status: 'pending',
          payment_status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ad submitted for review! 🚀');
      queryClient.invalidateQueries({ queryKey: ['user-ads', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create ad');
    },
  });

  // Update ad mutation
  const updateAdMutation = useMutation({
    mutationFn: async ({ adId, updates }: { adId: string; updates: Partial<UserAd> }) => {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_ads')
        .update(updates)
        .eq('id', adId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ad updated');
      queryClient.invalidateQueries({ queryKey: ['user-ads', userId] });
    },
    onError: () => {
      toast.error('Failed to update ad');
    },
  });

  // Delete ad mutation
  const deleteAdMutation = useMutation({
    mutationFn: async (adId: string) => {
      if (!userId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_ads')
        .delete()
        .eq('id', adId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ad deleted');
      queryClient.invalidateQueries({ queryKey: ['user-ads', userId] });
    },
    onError: () => {
      toast.error('Failed to delete ad');
    },
  });

  // Pause/Resume ad
  const toggleAdStatus = useMutation({
    mutationFn: async ({ adId, paused }: { adId: string; paused: boolean }) => {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_ads')
        .update({ status: paused ? 'paused' : 'active' })
        .eq('id', adId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { paused }) => {
      toast.success(paused ? 'Ad paused' : 'Ad resumed');
      queryClient.invalidateQueries({ queryKey: ['user-ads', userId] });
    },
    onError: () => {
      toast.error('Failed to update ad status');
    },
  });

  return {
    ads: adsQuery.data || [],
    isLoading: adsQuery.isPending,
    error: adsQuery.error,
    createAd: createAdMutation.mutate,
    createAdAsync: createAdMutation.mutateAsync,
    updateAd: updateAdMutation.mutate,
    deleteAd: deleteAdMutation.mutate,
    toggleAdStatus: toggleAdStatus.mutate,
    isCreating: createAdMutation.isPending,
    isUpdating: updateAdMutation.isPending,
    isDeleting: deleteAdMutation.isPending,
  };
}

/**
 * Hook to fetch active user ads for display in feed
 */
export function useActiveUserAds() {
  return useQuery({
    queryKey: ['active-user-ads'],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('user_ads')
        .select(`
          *,
          profiles:user_id(display_name, avatar_url)
        `)
        .eq('status', 'active')
        .eq('payment_status', 'paid')
        .lte('start_date', now)
        .gte('end_date', now)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
