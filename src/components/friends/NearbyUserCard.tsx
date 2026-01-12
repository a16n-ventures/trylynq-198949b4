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
  
  // State to hold fetched profile details if props are missing/generic
  const [fetchedDetails, setFetchedDetails] = useState<{ display_name?: string; username?: string; avatar_url?: string } | null>(null);

  // Effect to fetch real user details if name is missing or generic (UserXXXX)
  useEffect(() => {
    // If we already have a good display name in props, don't fetch
    // Checks for "User" followed by last 4 chars of ID
    const isGenericName = !profile.display_name || (profile.user_id && profile.display_name === `User${profile.user_id.slice(-4)}`);
    
    if (!isGenericName) return;
    if (!profile.user_id) return;

    const fetchRealProfileData = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, username, avatar_url')
          .eq('user_id', profile.user_id)
          .maybeSingle();

        if (!error && data) {
          setFetchedDetails(data);
        }
      } catch (err) {
        console.error("Error fetching user details:", err);
      }
    };

    fetchRealProfileData();
  }, [profile.user_id, profile.display_name]);

  // Fetch mutual friends logic
  useEffect(() => {
    if (!user || !profile.user_id) return;

    const fetchMutuals = async () => {
      try {
        // 1. Get my accepted friends
        const { data: myFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const myFriendIds = new Set(
          myFriendships?.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)
        );

        // 2. Get their accepted friends
        const { data: theirFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${profile.user_id},addressee_id.eq.${profile.user_id}`)
          .eq('status', 'accepted');

        const theirFriendIds = new Set(
          theirFriendships?.map(f => f.requester_id === profile.user_id ? f.addressee_id : f.requester_id)
        );

        // 3. Calculate intersection
        const mutualIds = [...myFriendIds].filter(id => theirFriendIds.has(id));
        setMutualsCount(mutualIds.length);

        // 4. If mutuals exist, fetch their basic profiles for the dialog
        if (mutualIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, user_id, display_name, avatar_url')
            .in('user_id', mutualIds)
            .limit(20); // Limit to 20 for preview
          setMutuals(profiles || []);
        }
      } catch (err) {
        console.error("Error fetching mutuals:", err);
      }
    };

    fetchMutuals();
  }, [user, profile.user_id]);

  const formatDistance = (km?: number) => {
    if (km === undefined) return null;
    return km < 1 ? `${Math.round(km * 1000)}m away` : `${km.toFixed(1)}km away`;
  };

  // Logic to prioritize fetched data over props, over generic fallback
  const finalAvatar = fetchedDetails?.avatar_url || profile.avatar_url;
  const finalDisplayName = 
    fetchedDetails?.display_name || 
    profile.display_name || 
    fetchedDetails?.username || 
    (profile as any).username || 
    (profile as any).email ||
    `User${profile.user_id?.slice(-4) || ''}`;

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 transition-all hover:bg-muted/10">
        {/* Clickable Avatar */}
        <div className="cursor-pointer" onClick={() => setShowProfile(true)}>
          <Avatar className="w-12 h-12 border border-border/50">
            <AvatarImage src={finalAvatar || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {finalDisplayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          {/* Clickable Name */}
          <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setShowProfile(true)}>
            <span className="font-semibold truncate group-hover:underline underline-offset-2">{finalDisplayName}</span>
            <PremiumBadge userId={profile.user_id} size="sm" />
          </div>

          <div className="flex flex-col gap-0.5 mt-0.5">
            {profile.distance_km !== undefined && (
              <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {formatDistance(profile.distance_km)}
              </div>
            )}
            
            {/* Mutual Friends Trigger */}
            {mutualsCount > 0 && (
              <button 
                className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMutuals(true);
                }}
              >
                <Users className="w-3 h-3" />
                {mutualsCount} mutual friend{mutualsCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
        
        <Button 
          size="sm" 
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-sm transition-transform active:scale-95"
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

      {/* 1. Mutual Friends Modal */}
      <Dialog open={showMutuals} onOpenChange={setShowMutuals}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Mutual Friends ({mutualsCount})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64 mt-2 pr-2">
            <div className="space-y-2">
              {mutuals.length > 0 ? mutuals.map((friend) => (
                <div key={friend.user_id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <Avatar className="w-9 h-9 border border-border/50">
                    <AvatarImage src={friend.avatar_url} />
                    <AvatarFallback>{friend.display_name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{friend.display_name || 'Unknown User'}</span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">Loading mutuals...</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* 2. Profile Preview Modal */}
      <FriendProfilePreview 
        profile={profile}
        open={showProfile}
        onClose={() => setShowProfile(false)}
        onRemoveFriend={() => {}} 
        onBlockUser={() => {}}
        onReportUser={() => {}}
      />
    </>
  );
}
