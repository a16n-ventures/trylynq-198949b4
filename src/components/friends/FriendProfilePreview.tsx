import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageSquare, MapPin, UserMinus, Ban, Flag, Clock,
  Link2, Globe, Instagram, Twitter, Linkedin, Github,
  ShieldCheck, Briefcase, Store, ArrowRight, Heart
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Profile } from "@/hooks/useFriends";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileLink {
  id: string;
  title: string;
  url: string;
}

interface FriendProfilePreviewProps {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
  friendshipId?: string;
  onRemoveFriend?: (friendshipId: string) => void;
  onBlockUser?: (userId: string) => void;
  onReportUser?: (userId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getLinkIcon = (url: string) => {
  if (url.includes('instagram.com')) return Instagram;
  if (url.includes('twitter.com') || url.includes('x.com')) return Twitter;
  if (url.includes('linkedin.com')) return Linkedin;
  if (url.includes('github.com')) return Github;
  return Globe;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

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

  // Record profile view when dialog opens
  useEffect(() => {
    if (open && profile?.user_id) {
      (supabase.rpc as any)('record_profile_view', { target_user_id: profile.user_id })
        .then(() => {}).catch(() => {});
    }
  }, [open, profile?.user_id]);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const { data: fullProfile, isLoading } = useQuery({
    queryKey: ['friendProfile', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      try {
        const [profileRes, locationRes, premiumRes, subRes, linksRes, storeRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', profile.user_id).single(),
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
          supabase
            .from('profile_links')
            .select('*')
            .eq('user_id', profile.user_id)
            .order('sort_order', { ascending: true }),
          // Store info for business users
          (supabase.from('stores') as any)
            .select('id, name, category, logo_url')
            .eq('owner_id', profile.user_id)
            .eq('is_active', true)
            .maybeSingle(),
        ]);

        const isPremium = !!premiumRes.data || subRes.data?.status === 'active';

        // Links: DB first, fallback to legacy preferences
        let links: ProfileLink[] = [];
        if (linksRes.data && linksRes.data.length > 0) {
          links = linksRes.data.map((l: any) => ({ id: l.id, title: l.title, url: l.url }));
        } else {
          const preferences = profileRes.data?.preferences as { links?: ProfileLink[] } | null;
          links = preferences?.links || [];
        }

        return {
          ...profileRes.data,
          location: locationRes.data,
          isPremium,
          links,
          store: storeRes.data || null,
        };
      } catch (error) {
        console.error('Error fetching friend profile:', error);
        throw error;
      }
    },
    enabled: open && !!profile?.user_id,
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const isBusinessUser  = fullProfile?.user_type === 'business';
  const isVerified      = fullProfile?.verification_status === 'verified';
  const skills: string[]    = fullProfile?.skills    || [];
  const interests: string[] = fullProfile?.interests || [];

  const lastSeen = fullProfile?.location?.last_seen
    ? formatDistanceToNow(new Date(fullProfile.location.last_seen), { addSuffix: true })
    : null;

  // ── Handlers ───────────────────────────────────────────────────────────────
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

  // Correct deep-link format that Messages.tsx useEffect expects
  const handleMessage = () => {
    navigate(`/app/messages?type=dm&id=${profile?.user_id}`);
    onClose();
  };

  // Opens escrow-protected service chat (Messages.tsx Gap 5)
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle className="sr-only">Profile Preview</DialogTitle>
        </DialogHeader>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center gap-4 p-8">
            <Skeleton className="w-24 h-24 rounded-full" />
            <Skeleton className="w-36 h-5" />
            <Skeleton className="w-52 h-4" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        )}

        {/* ── Not found ──────────────────────────────────────────────────── */}
        {!isLoading && !fullProfile && (
          <div className="py-12 text-center text-muted-foreground p-6">
            <p className="text-sm">Profile not found</p>
          </div>
        )}

        {/* ── Main content ───────────────────────────────────────────────── */}
        {!isLoading && fullProfile && (
          <div className="flex flex-col">

            {/* ── Header band ─────────────────────────────────────────────── */}
            <div className={`relative px-6 pt-8 pb-5 flex flex-col items-center text-center
              ${isBusinessUser
                ? 'bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent'
                : 'bg-gradient-to-b from-primary/8 via-primary/4 to-transparent'
              }`}>

              {/* Verified ribbon — top right, business only */}
              {isBusinessUser && isVerified && (
                <div className="absolute top-3 right-4 flex items-center gap-1 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-full px-2.5 py-1">
                  <ShieldCheck className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300">Verified</span>
                </div>
              )}

              {/* Avatar */}
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

              {/* Name + premium badge */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold">{fullProfile.display_name || 'Unknown User'}</h3>
                {fullProfile.isPremium && (
                  <svg className="w-5 h-5 text-blue-500 shrink-0" viewBox="0 0 22 22" fill="currentColor" aria-label="Premium">
                    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                  </svg>
                )}
              </div>

              {/* Store name — business only */}
              {isBusinessUser && fullProfile.store && (
                <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-1 mb-1">
                  <Store className="w-3 h-3" />
                  {fullProfile.store.name} · {fullProfile.store.category}
                </p>
              )}

              {/* Bio */}
              {fullProfile.bio && (
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mt-1">
                  {fullProfile.bio}
                </p>
              )}

              {/* Business: skill pills */}
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

              {/* Personal: interest pills */}
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

            {/* ── Body ──────────────────────────────────────────────────────── */}
            <div className="px-5 pb-5 space-y-4">

              {/* Location row */}
              {fullProfile.location?.is_sharing_location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
                  <MapPin className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span>Sharing location</span>
                  {lastSeen && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate text-xs">{lastSeen}</span>
                    </>
                  )}
                </div>
              )}

              {/* Profile links */}
              {fullProfile.links && fullProfile.links.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                    <Link2 className="w-3 h-3" /> Links
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fullProfile.links.slice(0, 4).map((link: ProfileLink) => {
                      const LinkIcon = getLinkIcon(link.url);
                      return (
                        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted/70 transition-all text-xs font-medium">
                          <LinkIcon className="w-3 h-3 text-primary" />
                          <span className="truncate max-w-[80px]">{link.title}</span>
                        </a>
                      );
                    })}
                    {fullProfile.links.length > 4 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{fullProfile.links.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── CTAs ──────────────────────────────────────────────────── */}
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
                    <Button variant="outline" className="h-10 text-sm" onClick={handleViewCatalog}>
                      <Store className="w-4 h-4 mr-1.5" /> Catalog
                    </Button>
                  </div>
                  <Button variant="ghost" className="w-full h-9 text-sm text-muted-foreground"
                    onClick={handleViewOnMap}>
                    <MapPin className="w-4 h-4 mr-1.5" /> View on Map
                  </Button>
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

              {/* ── Danger zone ────────────────────────────────────────────── */}
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
