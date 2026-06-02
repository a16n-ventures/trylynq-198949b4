import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, MapPin, Loader2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FriendProfilePreview } from "@/components/friends/FriendProfilePreview";
import { BlockReportDialog } from "@/components/friends/BlockReportDialog";
import { toast } from "sonner";
import type { NearbyProfile } from "@/hooks/useNearbyUsers"; 

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
  
  // Block/Report dialog state
  const [blockReportDialog, setBlockReportDialog] = useState<{
    open: boolean;
    type: 'block' | 'report';
  }>({ open: false, type: 'block' });
  const [isBlockingOrReporting, setIsBlockingOrReporting] = useState(false);
  
  // State to hold fetched profile details - ALWAYS fetch to guarantee real data
  const [fetchedDetails, setFetchedDetails] = useState<{ 
    display_name?: string | null; 
    username?: string | null; 
    avatar_url?: string | null;
    bio?: string | null;
    email?: string | null;
  } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // NUCLEAR FIX: Always fetch the real profile data from DB regardless of what's passed
  useEffect(() => {
    if (!profile.user_id) {
      setIsLoadingProfile(false);
      return;
    }

    const fetchRealProfileData = async () => {
      setIsLoadingProfile(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, username, avatar_url, bio, email')
          .eq('user_id', profile.user_id)
          .single();

        if (!error && data) {
          setFetchedDetails(data);
        }
      } catch (err) {
        console.error("Error fetching user details:", err);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchRealProfileData();
  }, [profile.user_id]);

  // 2. Fetch Mutual Friends
  useEffect(() => {
    if (!user || !profile.user_id) return;

    const fetchMutuals = async () => {
      try {
        // Get my accepted friends
        const { data: myFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted');
        
        const myFriendIds = new Set(
          (myFriendships || []).map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)
        );

        // Get their accepted friends
        const { data: theirFriendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${profile.user_id},addressee_id.eq.${profile.user_id}`)
          .eq('status', 'accepted');

        const theirFriendIds = new Set(
          (theirFriendships || []).map(f => f.requester_id === profile.user_id ? f.addressee_id : f.requester_id)
        );

        // Calculate intersection
        const mutualIds = [...myFriendIds].filter(id => theirFriendIds.has(id));
        setMutualsCount(mutualIds.length);

        // Fetch basic profiles for mutuals
        if (mutualIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, user_id, display_name, avatar_url')
            .in('user_id', mutualIds)
            .limit(20);
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

  // Priority: 1. Fetched display_name, 2. Fetched username, 3. Fetched email (before @), 4. Passed data
  const finalAvatar = fetchedDetails?.avatar_url || profile.avatar_url;
  const finalDisplayName = (() => {
    // Fetched data takes priority
    if (fetchedDetails?.display_name && fetchedDetails.display_name.trim()) {
      return fetchedDetails.display_name;
    }
    if (fetchedDetails?.username && fetchedDetails.username.trim()) {
      return fetchedDetails.username;
    }
    if (fetchedDetails?.email) {
      return fetchedDetails.email.split('@')[0];
    }
    // Fallback to passed profile data
    if (profile.display_name && profile.display_name.trim() && !profile.display_name.startsWith('User')) {
      return profile.display_name;
    }
    // Last resort
    return `User${profile.user_id?.slice(-4) || ''}`;
  })();

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 transition-all hover:bg-muted/10">
        <div className="cursor-pointer" onClick={() => setShowProfile(true)}>
          <Avatar className="w-12 h-12 border border-border/50">
            <AvatarImage src={finalAvatar || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {finalDisplayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 cursor-pointer group" onClick={() => setShowProfile(true)}>
            <span className="font-semibold truncate group-hover:underline underline-offset-2">{finalDisplayName}</span>
            <PremiumBadge userId={profile.user_id} />
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

      <Dialog open={showMutuals} onOpenChange={setShowMutuals}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Mutual Friends ({mutualsCount})
            </DialogTitle>
          </DialogHeader>
          
          {/* ✅ REPLACED ScrollArea with standard div to ensure compatibility */}
          <div className="h-64 mt-2 pr-2 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
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
          </div>
        </DialogContent>
      </Dialog>

      <FriendProfilePreview 
        profile={profile}
        open={showProfile}
        onClose={() => setShowProfile(false)}
        onRemoveFriend={() => {}} 
        onBlockUser={() => {
          setShowProfile(false);
          setBlockReportDialog({ open: true, type: 'block' });
        }}
        onReportUser={() => {
          setShowProfile(false);
          setBlockReportDialog({ open: true, type: 'report' });
        }}
      />

      <BlockReportDialog
        open={blockReportDialog.open}
        onClose={() => setBlockReportDialog({ open: false, type: 'block' })}
        type={blockReportDialog.type}
        userName={finalDisplayName}
        onConfirm={async (reason: string) => {
          if (!user || !profile.user_id) return;
          setIsBlockingOrReporting(true);
          try {
            if (blockReportDialog.type === 'block') {
              await supabase.from('blocked_users').insert({
                blocker_id: user.id,
                blocked_id: profile.user_id,
                reason
              });
              toast.success('User blocked');
            } else {
              await supabase.from('reports').insert({
                reporter_id: user.id,
                target_id: profile.user_id,
                target_type: 'user',
                reason,
                status: 'pending'
              });
              toast.success('Report submitted');
            }
            setBlockReportDialog({ open: false, type: 'block' });
          } catch (e: any) {
            toast.error(e.message || 'Failed to process request');
          } finally {
            setIsBlockingOrReporting(false);
          }
        }}
        isPending={isBlockingOrReporting}
      />
    </>
  );
}
