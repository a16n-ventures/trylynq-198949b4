import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, MoreVertical, UserMinus, Ban, Flag, MapPin, Users } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { BusinessBadge } from "@/components/BusinessBadge";

// Premium Badge Component
const PremiumBadge = () => (
  <svg 
    className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 ml-1" 
    viewBox="0 0 22 22" 
    fill="currentColor"
    aria-label="Verified"
  >
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
  </svg>
);

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
  const { user } = useAuth();
  const friend = friendship.requester_id === currentUserId ? friendship.addressee : friendship.requester;
  const [mutualsCount, setMutualsCount] = useState<number>(0);

  // Fetch mutual friends count
  useEffect(() => {
    if (!user || !friend.user_id) return;

    const fetchMutualsCount = async () => {
      try {
        // Get my accepted friends
        const { data: myFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const myFriendIds = new Set(
          myFriendships?.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)
        );

        // Get their accepted friends
        const { data: theirFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${friend.user_id},addressee_id.eq.${friend.user_id}`)
          .eq('status', 'accepted');

        const theirFriendIds = new Set(
          theirFriendships?.map(f => f.requester_id === friend.user_id ? f.addressee_id : f.requester_id)
        );

        // Calculate intersection (exclude current user and the friend themselves)
        const mutualIds = [...myFriendIds].filter(id => theirFriendIds.has(id) && id !== user.id && id !== friend.user_id);
        setMutualsCount(mutualIds.length);
      } catch (err) {
        console.error("Error fetching mutuals:", err);
      }
    };

    fetchMutualsCount();
  }, [user, friend.user_id]);

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
            {(friend as any)?.account_type === 'business' && <BusinessBadge />}
            {(friend as any)?.is_premium && <PremiumBadge />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Connected</span>
            {mutualsCount > 0 && (
              <span className="flex items-center gap-1 text-primary/80">
                <Users className="w-3 h-3" />
                {mutualsCount} mutual{mutualsCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </button>
      
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(`/app/messages?tab=dm&userId=${friend.user_id}`)}
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
