import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, MapPin, Loader2, Users } from "lucide-react";
import { PremiumBadge } from "@/components/PremiumBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FriendProfilePreview } from "@/components/friends/FriendProfilePreview";
import type { NearbyProfile } from "@/hooks/useNearbyUsers";

interface NearbyUserCardProps {
  profile: NearbyProfile;
  onAddFriend: (profile: NearbyProfile) => void;
  isAdding?: boolean;
}

export function NearbyUserCard({ profile, onAddFriend, isAdding }: NearbyUserCardProps) {
  const { user } = useAuth();
  const [mutualsCount, setMutualsCount] = useState<number>(0);
  const [mutuals, setMutuals] = useState<any[]>([]);
  const [showMutuals, setShowMutuals] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Fetch mutual friends on mount
  useEffect(() => {
    if (!user || !profile.user_id) return;

    const fetchMutuals = async () => {
      try {
        // 1. Get my friends IDs
        const { data: myFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const myFriendIds = new Set(
          myFriendships?.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)
        );

        // 2. Get their friends IDs
        const { data: theirFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${profile.user_id},addressee_id.eq.${profile.user_id}`)
          .eq('status', 'accepted');

        const theirFriendIds = new Set(
          theirFriendships?.map(f => f.requester_id === profile.user_id ? f.addressee_id : f.requester_id)
        );

        // 3. Find intersection (Mutuals)
        const mutualIds = [...myFriendIds].filter(id => theirFriendIds.has(id));
        
        setMutualsCount(mutualIds.length);

        // 4. Fetch profiles for mutual friends if any exist
        if (mutualIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, user_id, display_name, avatar_url')
            .in('user_id', mutualIds);
          setMutuals(profiles || []);
        }
      } catch (err) {
        console.error("Error calculating mutual friends:", err);
      }
    };

    fetchMutuals();
  }, [user, profile.user_id]);

  const formatDistance = (km?: number) => {
    if (km === undefined) return null;
    return km < 1 ? `${Math.round(km * 1000)}m away` : `${km.toFixed(1)}km away`;
  };

  const displayName = profile.display_name || profile.email || profile.username || `User${profile.user_id?.slice(-4) || ''}`;

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 transition-colors hover:bg-muted/10">
        {/* Clickable Avatar for Profile Preview */}
        <div className="cursor-pointer" onClick={() => setShowProfile(true)}>
          <Avatar className="w-12 h-12 border border-border/50">
            <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {displayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          {/* Clickable Name for Profile Preview */}
          <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setShowProfile(true)}>
            <span className="font-semibold truncate group-hover:underline decoration-primary/50 underline-offset-4">{displayName}</span>
            <PremiumBadge userId={profile.user_id} size="sm" />
          </div>

          <div className="flex flex-col gap-0.5 mt-0.5">
            {profile.distance_km !== undefined && (
              <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {formatDistance(profile.distance_km)}
              </div>
            )}
            
            {/* Clickable Mutual Friends Count */}
            {mutualsCount > 0 && (
              <div 
                className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-primary transition-colors w-fit"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMutuals(true);
                }}
              >
                <Users className="w-3 h-3" />
                {mutualsCount} mutual friend{mutualsCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
        
        <Button 
          size="sm" 
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-sm"
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

      {/* Mutual Friends Modal */}
      <Dialog open={showMutuals} onOpenChange={setShowMutuals}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Mutual Friends ({mutualsCount})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64 mt-2 pr-4">
            <div className="space-y-3">
              {mutuals.map((friend) => (
                <div key={friend.id || friend.user_id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg">
                  <Avatar className="w-10 h-10 border border-border/50">
                    <AvatarImage src={friend.avatar_url} />
                    <AvatarFallback>{friend.display_name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{friend.display_name || 'Unknown User'}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Profile Preview Modal */}
      <FriendProfilePreview 
        profile={profile}
        open={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  );
}
