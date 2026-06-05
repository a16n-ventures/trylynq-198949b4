import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageSquare, MapPin, UserMinus, Ban, Flag, Clock, Briefcase, Store, ArrowRight, Heart
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Profile } from "@/hooks/useFriends"; 
import { PremiumBadge } from "@/components/PremiumBadge";

interface FriendProfilePreviewProps {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
  friendshipId?: string;
  onRemoveFriend?: (friendshipId: string) => void;
  onBlockUser?: (userId: string) => void;
  onReportUser?: (userId: string) => void;
}

export function FriendProfilePreview({
  profile,
  open,
  onClose,
  friendshipId,
  onRemoveFriend,
  onBlockUser,
  onReportUser,
}: FriendProfilePreviewProps) {
  const navigate = useNavigate();
  const [confirmAction, setConfirmAction] = useState<'remove' | 'block' | null>(null);

  useEffect(() => {
    if (open && profile?.user_id) {
      (supabase.rpc as any)('record_profile_view', { target_user_id: profile.user_id })
        .then(() => {}).catch(() => {});
    }
  }, [open, profile?.user_id]);

  const { data: fullProfile, isLoading } = useQuery({
    queryKey: ['friendProfile', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      try {
        const [profileRes, locationRes, premiumRes, subRes] = await Promise.all([
          supabase.from('profiles').select('*, skills, interests').eq('user_id', profile.user_id).single(),
          supabase.from('user_locations').select('*').eq('user_id', profile.user_id).maybeSingle(),
          supabase
            .from('premium_features')
            .select('is_active, expires_at')
            .eq('user_id', profile.user_id)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle(),
          supabase
            .from('subscriptions')
            .select('status')
            .eq('user_id', profile.user_id)
            .maybeSingle(),
        ]);

        const isPremium = !!premiumRes.data || subRes.data?.status === 'active';

        // Store fetched separately — failure cannot crash the whole preview
        let storeData = null;
        try {
          const { data } = await (supabase.from('stores') as any)
            .select('id, name, category')
            .eq('owner_id', profile.user_id)
            .eq('is_active', true)
            .maybeSingle();
          storeData = data;
        } catch (_) {}

        return {
          ...profileRes.data,
          skills: profileRes.data?.skills || [],       // 👈 Force fallback protection arrays
          interests: profileRes.data?.interests || [], // 👈 Force fallback protection arrays
          location: locationRes.data,
          isPremium,
          store: storeData,
        };
      } catch (error) {
        console.error('Error fetching friend profile:', error);
        throw error;
      }
    },
    enabled: open && !!profile?.user_id,
  });

  const isBusinessUser  = fullProfile?.account_type === 'business';
  const isVerified      = fullProfile?.verification_status === 'verified';
  
  // 💡 NUCLEAR FIX: Enforce arrays aggressively to prevent .map() crashes
  const skills: string[] = Array.isArray(fullProfile?.skills) ? fullProfile.skills : [];
  const interests: string[] = Array.isArray(fullProfile?.interests) ? fullProfile.interests : [];

  const lastSeen = fullProfile?.location?.last_seen
    ? formatDistanceToNow(new Date(fullProfile.location.last_seen), { addSuffix: true })
    : null;

  const handleAction = (action: 'remove' | 'block') => {
    if (confirmAction === action) {
      if (action === 'remove' && friendshipId && onRemoveFriend) {
        onRemoveFriend(friendshipId); onClose();
      } else if (action === 'block' && profile && onBlockUser) {
        onBlockUser(profile.user_id); onClose();
      }
      setConfirmAction(null);
    } else {
      setConfirmAction(action);
    }
  };

  const handleMessage = () => {
    navigate(`/app/messages?type=dm&id=${profile?.user_id}`);
    onClose();
  };

  const handleRequestService = () => {
    navigate(`/app/messages?type=service&id=${profile?.user_id}`);
    onClose();
  };

  const handleViewOnMap = () => {
    navigate(`/app/map?focus=${profile?.user_id}`);
    onClose();
  };

  const handleViewCatalog = () => {
    navigate(`/app/marketplace?seller=${profile?.user_id}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle className="sr-only">Profile Preview</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center gap-4 p-8">
            <Skeleton className="w-24 h-24 rounded-full" />
            <Skeleton className="w-36 h-5" />
            <Skeleton className="w-52 h-4" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        )}

        {!isLoading && !fullProfile && (
          <div className="py-12 text-center text-muted-foreground p-6">
            <p className="text-sm">Profile not found</p>
          </div>
        )}

        {!isLoading && fullProfile && (
          <div className="flex flex-col">

            {/* Header band */}
            <div className={`relative px-6 pt-8 pb-5 flex flex-col items-center text-center
              ${isBusinessUser
                ? 'bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent'
                : 'bg-gradient-to-b from-primary/8 via-primary/4 to-transparent'
              }`}>

              <div className="relative mb-3">
                <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                  <AvatarImage src={fullProfile.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-muted text-muted-foreground">
                    {fullProfile.display_name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {isBusinessUser && (
                  <div className="absolute -bottom-1 -right-1 bg-cyan-500 rounded-full p-1.5 border-2 border-background">
                    <Briefcase className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold">{fullProfile.display_name || 'Unknown User'}</h3>
                {fullProfile.isPremium && 
                  <PremiumBadge />
                }
              </div>

              {isBusinessUser && fullProfile.store && (
                <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-1 mb-1">
                  <Store className="w-3 h-3" />
                  {fullProfile.store.name} · {fullProfile.store.category}
                </p>
              )}

              {fullProfile.bio && (
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mt-1">
                  {fullProfile.bio}
                </p>
              )}

              {isBusinessUser && skills.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {skills.slice(0, 5).map((skill) => (
                    <Badge key={skill} variant="secondary"
                      className="text-[10px] bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800">
                      {skill}
                    </Badge>
                  ))}
                  {skills.length > 5 && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      +{skills.length - 5} more
                    </Badge>
                  )}
                </div>
              )}

              {!isBusinessUser && interests.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {interests.slice(0, 5).map((interest) => (
                    <Badge key={interest} variant="secondary"
                      className="text-[10px] bg-primary/8 text-primary/80 border-primary/20">
                      <Heart className="w-2.5 h-2.5 mr-1 opacity-50" />
                      {interest}
                    </Badge>
                  ))}
                  {interests.length > 5 && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      +{interests.length - 5} more
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="px-5 pb-5 space-y-4">

              {/* Location — centered */}
              {fullProfile.location?.is_sharing_location && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
                  <MapPin className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span>Sharing location</span>
                  {lastSeen && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="text-xs">{lastSeen}</span>
                    </>
                  )}
                </div>
              )}

              {/* CTAs */}
              {isBusinessUser ? (
                <div className="space-y-2">
                  <Button
                    className="w-full h-11 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold shadow-sm"
                    onClick={handleRequestService}
                  >
                    <Briefcase className="w-4 h-4 mr-2" />
                    Request Service
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-10 text-sm" onClick={handleMessage}>
                      <MessageSquare className="w-4 h-4 mr-1.5" /> Message
                    </Button>
                    <Button variant="outline" className="h-10 text-sm" onClick={handleViewOnMap}>
                      <MapPin className="w-4 h-4 mr-1.5" /> View on Map
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11" onClick={handleMessage}>
                    <MessageSquare className="w-4 h-4 mr-2" /> Message
                  </Button>
                  <Button variant="outline" className="h-11" onClick={handleViewOnMap}>
                    <MapPin className="w-4 h-4 mr-2" /> View on Map
                  </Button>
                </div>
              )}

              {/* Danger zone */}
              {(friendshipId || onBlockUser || onReportUser) && (
                <div className="pt-3 border-t border-border/50 space-y-2">
                  {friendshipId && onRemoveFriend && (
                    <Button variant="outline"
                      className={`w-full h-9 text-sm ${
                        confirmAction === 'remove'
                          ? 'border-orange-500 text-orange-600'
                          : 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950'
                      }`}
                      onClick={() => handleAction('remove')}>
                      <UserMinus className="w-4 h-4 mr-2" />
                      {confirmAction === 'remove' ? 'Confirm Remove' : 'Remove Friend'}
                    </Button>
                  )}
                  {onBlockUser && (
                    <Button variant="outline"
                      className={`w-full h-9 text-sm ${
                        confirmAction === 'block'
                          ? 'border-red-500 text-red-600'
                          : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                      }`}
                      onClick={() => handleAction('block')}>
                      <Ban className="w-4 h-4 mr-2" />
                      {confirmAction === 'block' ? 'Confirm Block' : 'Block User'}
                    </Button>
                  )}
                  {onReportUser && (
                    <Button variant="ghost"
                      className="w-full h-9 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => { onReportUser(profile!.user_id); onClose(); }}>
                      <Flag className="w-4 h-4 mr-2" />
                      Report User
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
