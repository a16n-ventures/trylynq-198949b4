import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: 'pending' | 'completed';
  reward_claimed: boolean;
  reward_amount: number;
  created_at: string;
  completed_at?: string;
  referred_profile?: {
    display_name: string;
    avatar_url?: string;
  };
}

export interface ReferralStats {
  total_referrals: number;
  completed_referrals: number;
  pending_rewards: number;
  total_earnings: number;
}

export function useReferrals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's referral code
  const { data: referralCode, isLoading: codeLoading } = useQuery({
    queryKey: ['my-referral-code', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data?.referral_code;
    },
    enabled: !!user?.id,
  });

  // Fetch referral settings from admin
  const { data: referralSettings } = useQuery({
    queryKey: ['referral-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['enable_referrals', 'referral_reward_amount']);
      
      const settings: { enabled: boolean; reward_amount: number } = {
        enabled: true,
        reward_amount: 500 // Default NGN 500
      };
      
      data?.forEach(item => {
        if (item.key === 'enable_referrals') {
          settings.enabled = item.value === true || item.value === 'true';
        }
        if (item.key === 'referral_reward_amount') {
          settings.reward_amount = Number(item.value) || 500;
        }
      });
      
      return settings;
    },
  });

  // Fetch my referrals
  const { data: myReferrals = [], isLoading: referralsLoading } = useQuery<Referral[]>({
    queryKey: ['my-referrals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch referred user profiles
      if (data && data.length > 0) {
        const referredIds = data.map(r => r.referred_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', referredIds);
        
        return data.map(referral => ({
          ...referral,
          referred_profile: profiles?.find(p => p.user_id === referral.referred_id)
        })) as Referral[];
      }
      
      return data as Referral[];
    },
    enabled: !!user?.id,
  });

  // Calculate stats
  const stats: ReferralStats = {
    total_referrals: myReferrals.length,
    completed_referrals: myReferrals.filter(r => r.status === 'completed').length,
    pending_rewards: myReferrals.filter(r => r.status === 'completed' && !r.reward_claimed).length,
    total_earnings: myReferrals
      .filter(r => r.reward_claimed)
      .reduce((sum, r) => sum + (r.reward_amount || 0), 0)
  };

  // Apply referral code (for new users)
  const applyReferralCode = useMutation({
    mutationFn: async (code: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      // Find the referrer by code
      const { data: referrer, error: findError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('referral_code', code.toUpperCase())
        .single();
      
      if (findError || !referrer) {
        throw new Error("Invalid referral code");
      }
      
      if (referrer.user_id === user.id) {
        throw new Error("You cannot use your own referral code");
      }
      
      // Check if already referred
      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', user.id)
        .maybeSingle();
      
      if (existing) {
        throw new Error("You have already used a referral code");
      }
      
      // Create referral record
      const { error } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrer.user_id,
          referred_id: user.id,
          referral_code: code.toUpperCase(),
          status: 'pending'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Referral code applied successfully!");
      queryClient.invalidateQueries({ queryKey: ['my-referrals'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Generate share link
  const getShareLink = () => {
    if (!referralCode) return '';
    return `${window.location.origin}/signup?ref=${referralCode}`;
  };

  // Copy referral code
  const copyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      toast.success("Referral code copied!");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  // Copy share link
  const copyShareLink = async () => {
    const link = getShareLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Share via native share
  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Ahmia',
          text: `Join Ahmia using my referral code: ${referralCode}`,
          url: getShareLink()
        });
      } catch (e) {
        // User cancelled
      }
    } else {
      copyShareLink();
    }
  };

  return {
    referralCode,
    referralSettings,
    myReferrals,
    stats,
    isLoading: codeLoading || referralsLoading,
    applyReferralCode: applyReferralCode.mutate,
    isApplying: applyReferralCode.isPending,
    copyReferralCode,
    copyShareLink,
    shareInvite,
    getShareLink
  };
}
