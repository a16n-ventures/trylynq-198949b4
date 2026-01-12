import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, MapPin, UserMinus, Ban, Flag, Clock, Link2, ExternalLink, Globe, Instagram, Twitter, Linkedin, Github } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Profile } from "@/hooks/useFriends";

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

const getLinkIcon = (url: string) => {
  if (url.includes('instagram.com')) return Instagram;
  if (url.includes('twitter.com') || url.includes('x.com')) return Twitter;
  if (url.includes('linkedin.com')) return Linkedin;
  if (url.includes('github.com')) return Github;
  return Globe;
};

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

  const { data: fullProfile, isLoading } = useQuery({
    queryKey: ['friendProfile', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      
      try {
        const [profileRes, locationRes, premiumRes, subRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', profile.user_id).single(),
          supabase.from('user_locations').select('*').eq('user_id', profile.user_id).single(),
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
            .maybeSingle()
        ]);
        
        const isPremium = !!premiumRes.data || subRes.data?.status === 'active';
        
        // Parse links from preferences
        const preferences = profileRes.data?.preferences as { links?: ProfileLink[] } | null;
        const links = preferences?.links || [];
        
        return {
          ...profileRes.data,
          location: locationRes.data,
          isPremium,
          links
        };
      } catch (error) {
        console.error('Error fetching friend profile:', error);
        throw error;
      }
    },
    enabled: open && !!profile?.user_id,
  });

  const handleAction = (action: 'remove' | 'block') => {
    if (confirmAction === action) {
      if (action === 'remove' && friendshipId && onRemoveFriend) {
        onRemoveFriend(friendshipId);
        onClose();
      } else if (action === 'block' && profile && onBlockUser) {
        onBlockUser(profile.user_id);
        onClose();
      }
      setConfirmAction(null);
    } else {
      setConfirmAction(action);
    }
  };

  const handleMessage = () => {
    navigate(`/app/messages?userId=${profile?.user_id}`);
    onClose();
  };

  const handleViewOnMap = () => {
    navigate(`/app/map?focus=${profile?.user_id}`);
    onClose();
  };

  const lastSeen = fullProfile?.location?.last_seen 
    ? formatDistanceToNow(new Date(fullProfile.location.last_seen), { addSuffix: true })
    : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Profile Preview</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Skeleton className="w-24 h-24 rounded-full" />
            <Skeleton className="w-32 h-6" />
            <Skeleton className="w-48 h-4" />
          </div>
        ) : fullProfile ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <Avatar className="w-24 h-24 border-2 border-border">
              <AvatarImage src={fullProfile.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="text-2xl bg-muted text-muted-foreground">
                {fullProfile.display_name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-xl font-semibold">{fullProfile.display_name || 'Unknown User'}</h3>
                {fullProfile?.isPremium && (
                  <svg 
                    className="w-5 h-5 text-blue-500 flex-shrink-0" 
                    viewBox="0 0 22 22" 
                    fill="currentColor"
                    aria-label="Verified"
                  >
                    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                  </svg>
                )}
              </div>
              {fullProfile.bio && (
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">{fullProfile.bio}</p>
              )}
            </div>

            {/* Profile Links - Instagram style */}
            {fullProfile.links && fullProfile.links.length > 0 && (
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  <Link2 className="w-3 h-3" />
                  Links
                </div>
                <div className="space-y-1.5">
                  {fullProfile.links.slice(0, 3).map((link: ProfileLink) => {
                    const LinkIcon = getLinkIcon(link.url);
                    return (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-all group text-sm"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <LinkIcon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="flex-1 truncate font-medium">{link.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </a>
                    );
                  })}
                  {fullProfile.links.length > 3 && (
                    <p className="text-xs text-center text-muted-foreground">
                      +{fullProfile.links.length - 3} more links
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Location info */}
            {fullProfile.location?.is_sharing_location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                <MapPin className="w-4 h-4 text-green-500" />
                <span>Sharing location</span>
                {lastSeen && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <Clock className="w-3 h-3" />
                    <span>{lastSeen}</span>
                  </>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 w-full">
              <Button className="flex-1" onClick={handleMessage}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Message
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleViewOnMap}>
                <MapPin className="w-4 h-4 mr-2" />
                View on Map
              </Button>
            </div>

            {/* Danger zone */}
            <div className="w-full pt-4 border-t border-border space-y-2">
              {friendshipId && onRemoveFriend && (
                <Button 
                  variant="outline" 
                  className={`w-full ${confirmAction === 'remove' ? 'border-orange-500 text-orange-600' : 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950'}`}
                  onClick={() => handleAction('remove')}
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  {confirmAction === 'remove' ? 'Confirm Remove' : 'Remove Friend'}
                </Button>
              )}
              {onBlockUser && (
                <Button 
                  variant="outline" 
                  className={`w-full ${confirmAction === 'block' ? 'border-red-500 text-red-600' : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'}`}
                  onClick={() => handleAction('block')}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {confirmAction === 'block' ? 'Confirm Block' : 'Block User'}
                </Button>
              )}
              {onReportUser && (
                <Button 
                  variant="ghost" 
                  className="w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  onClick={() => {
                    onReportUser(profile!.user_id);
                    onClose();
                  }}
                >
                  <Flag className="w-4 h-4 mr-2" />
                  Report User
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            Profile not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
