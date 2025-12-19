import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, MapPin, UserMinus, Ban, Flag, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Profile } from "@/hooks/useFriends";

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

  // Fetch full profile data with location
  const { data: fullProfile, isLoading } = useQuery({
    queryKey: ['friendProfile', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      
      const [profileRes, locationRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', profile.user_id).single(),
        supabase.from('user_locations').select('*').eq('user_id', profile.user_id).single()
      ]);
      
      return {
        ...profileRes.data,
        location: locationRes.data
      };
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
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto">
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
              <h3 className="text-xl font-semibold">{fullProfile.display_name || 'Unknown User'}</h3>
              {fullProfile.bio && (
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">{fullProfile.bio}</p>
              )}
            </div>

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
