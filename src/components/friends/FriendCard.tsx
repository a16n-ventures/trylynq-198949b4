import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, MoreVertical, UserMinus, Ban, Flag, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Profile, Friendship } from "@/hooks/useFriends";

// ✅ FIXED: Added loading state and better error handling
const VerifiedBadge = ({ userId }: { userId: string }) => {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkPremiumStatus = async () => {
      try {
        setIsLoading(true);
        
        // Check for active subscription OR manual premium feature
        const { data: premiumFeature, error: premiumError } = await supabase
          .from('premium_features')
          .select('is_active, expires_at')
          .eq('user_id', userId)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        const { data: sub, error: subError } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', userId)
          .maybeSingle();

        // Debug logging (remove in production)
        if (premiumError) console.error('Premium feature error:', premiumError);
        if (subError) console.error('Subscription error:', subError);

        // User is premium if they have an active manual feature OR an active subscription
        const hasPremium = !!premiumFeature || sub?.status === 'active';
        setIsPremium(hasPremium);
      } catch (error) {
        console.error('Error checking premium status:', error);
        setIsPremium(false);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      checkPremiumStatus();
    }
  }, [userId]);

  // Don't show anything while loading or if not premium
  if (isLoading || !isPremium) return null;

  return (
    <svg 
      className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-0.5" 
      viewBox="0 0 22 22" 
      fill="currentColor"
      aria-label="Verified"
    >
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
};

interface FriendCardProps {
  friendship: Friendship;
  currentUserId: string;
  onRemove: (friendshipId: string) => void;
  onBlock: (userId: string) => void;
  onReport: (userId: string) => void;
  onViewProfile: (profile: Profile) => void;
  isRemoving?: boolean;
}

export function FriendCard({ 
  friendship, 
  currentUserId, 
  onRemove, 
  onBlock, 
  onReport,
  onViewProfile,
  isRemoving 
}: FriendCardProps) {
  const navigate = useNavigate();
  const friend = friendship.requester_id === currentUserId ? friendship.addressee : friendship.requester;

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-accent/5 transition-colors">
      <button
        onClick={() => onViewProfile(friend)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <Avatar className="w-12 h-12 border border-border/50">
          <AvatarImage src={friend.avatar_url || undefined} className="object-cover" />
          <AvatarFallback className="bg-muted text-muted-foreground">
            {friend.display_name?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold truncate">{friend.display_name || 'Unknown User'}</span>
            {/* ✅ FIXED: Using improved VerifiedBadge with loading state */}
            <VerifiedBadge userId={friend.user_id} />
          </div>
          <div className="text-xs text-muted-foreground">Connected</div>
        </div>
      </button>
      
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(`/app/messages?tab=dm?userId=${friend.user_id}`)}
        >
          <MessageSquare className="w-5 h-5 text-primary" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/app/map?focus=${friend.user_id}`)}>
              <MapPin className="w-4 h-4 mr-2" />
              View on Map
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onRemove(friendship.id)}
              disabled={isRemoving}
              className="text-orange-600"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              Remove Friend
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onBlock(friend.user_id)}
              className="text-red-600"
            >
              <Ban className="w-4 h-4 mr-2" />
              Block User
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onReport(friend.user_id)}
              className="text-red-600"
            >
              <Flag className="w-4 h-4 mr-2" />
              Report User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
