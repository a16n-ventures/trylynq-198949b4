import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, MapPin, Loader2 } from "lucide-react";
import { PremiumBadge } from "@/components/PremiumBadge";
import type { NearbyProfile } from "@/hooks/useNearbyUsers";

interface NearbyUserCardProps {
  profile: NearbyProfile;
  onAddFriend: (profile: NearbyProfile) => void;
  isAdding?: boolean;
}

export function NearbyUserCard({ profile, onAddFriend, isAdding }: NearbyUserCardProps) {
  const formatDistance = (km?: number) => {
    if (km === undefined) return null;
    return km < 1 ? `${Math.round(km * 1000)}m away` : `${km.toFixed(1)}km away`;
  };

  const displayName = profile.display_name || profile.email || profile.username || `User${profile.user_id?.slice(-4) || ''}`;

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
      <Avatar className="w-12 h-12 border border-border/50">
        <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground">
          {displayName[0]?.toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold truncate">{displayName}</span>
          <PremiumBadge userId={profile.user_id} size="sm" />
        </div>
        {profile.distance_km !== undefined && (
          <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {formatDistance(profile.distance_km)}
          </div>
        )}
      </div>
      
      <Button 
        size="sm" 
        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
        disabled={isAdding}
        onClick={() => onAddFriend(profile)}
      >
        {isAdding ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <UserPlus className="w-4 h-4 mr-1" />
        )}
        Add
      </Button>
    </div>
  );
}
