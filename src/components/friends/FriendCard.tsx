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
import { PremiumBadge } from "@/components/PremiumBadge";
import type { Profile, Friendship } from "@/hooks/useFriends";

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
            {friend.display_name?.[0]?.toUpperCase() || friend.username?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold truncate">{friend.display_name || friend.username || 'Unknown User'}</span>
            <PremiumBadge userId={friend.user_id} size="sm" />
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
