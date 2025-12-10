import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { 
  Edit3, 
  MapPin, 
  Users, 
  Camera, 
  Bell, 
  LogOut, 
  Crown, 
  Trash2,
  Loader2,
  Gift,
  Copy,
  Radar,
  BarChart3,
  Eye,
  Share2,
  ChevronRight,
  Shield,
  Check,
  X,
  Calendar,
  MessageSquare,
  Heart,
  Star,
  Zap,
  AlertCircle,
  RefreshCw // Added for manual refresh
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
// Added Context Import
import { useGeolocation } from '@/contexts/LocationContext';

// --- TYPES ---
interface ProfileData {
  user_id: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  created_at: string;
  profile_views_30d?: number;
  preferences?: {
    notifications: boolean;
    discovery_radius?: number;
  };
}

interface LocationData {
  is_sharing_location: boolean;
}

interface ProfileStats {
  friends: number;
  events: number;
  messages: number;
  event_views_30d?: number;
}

interface CombinedProfile {
  profile: ProfileData | null;
  location: LocationData | null;
  stats: ProfileStats;
}

// --- DATA FETCHING ---
const fetchProfileData = async (userId: string): Promise<CombinedProfile> => {
  const profileQuery = supabase.from('profiles').select('*').eq('user_id', userId).single();
  const locationQuery = supabase.from('user_locations').select('is_sharing_location').eq('user_id', userId).maybeSingle();
  
  const friendQuery = supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  const eventQuery = supabase
    .from('event_attendees')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const messageQuery = supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', userId);

  const eventViewsQuery = supabase
    .from('events')
    .select('event_views_30d')
    .eq('creator_id', userId);

  const [
    { data: profileData, error: profileError },
    { data: locationData },
    { count: friendCount },
    { count: eventCount },
    { count: messageCount },
    { data: eventViewsData }
  ] = await Promise.all([
    profileQuery, locationQuery, friendQuery, eventQuery, messageQuery, eventViewsQuery
  ]);

  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  
  const totalEventViews = eventViewsData?.reduce((acc, curr) => acc + (curr.event_views_30d || 0), 0) || 0;

  // Cast preferences from Json to the expected type
  const preferences = profileData?.preferences as { notifications: boolean; discovery_radius?: number } | null;

  return {
    profile: profileData ? { 
      ...profileData, 
      preferences: preferences || { notifications: true }
    } as ProfileData : null,
    location: locationData,
    stats: {
      friends: friendCount || 0,
      events: eventCount || 0,
      messages: messageCount || 0,
      event_views_30d: totalEventViews
    },
  };
};

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  
  // INTEGRATED: Use Global Location Context
  const { location: currentLocation, requestLocation } = useGeolocation();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [discoveryRadius, setDiscoveryRadius] = useState([5000]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isLocating, setIsLocating] = useState(false); 

  // MODIFIED: Added refetchInterval for real-time analytics updates
  const { data, isLoading: loading, refetch, isRefetching } = useQuery<CombinedProfile, Error>({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfileData(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 2, // 2 minutes stale time
    refetchInterval: 30000,   // Poll every 30 seconds for live stats
  });

  const { profile, location, stats } = data || { 
    profile: null, location: null, stats: { friends: 0, events: 0, messages: 0, event_views_30d: 0 } 
  };

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      if (profile.preferences?.discovery_radius) {
        setDiscoveryRadius([profile.preferences.discovery_radius]);
      }
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { displayName?: string; bio?: string; preferences?: any }) => {
      const currentPrefs = profile?.preferences || {};
      const newPrefs = { ...currentPrefs, ...updates.preferences };

      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
        preferences: newPrefs,
      };

      if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
      if (updates.bio !== undefined) dbUpdates.bio = updates.bio;

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('user_id', user!.id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated successfully');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },
    onError: (error: Error) => toast.error('Failed to update: ' + error.message)
  });

  // MODIFIED: Updated to use LocationContext instead of manual navigator.geolocation
  const toggleLocationMutation = useMutation({
    mutationFn: async ({ checked }: { checked: boolean }) => {
      // 1. Disabling location sharing
      if (!checked) {
        const { error } = await supabase
          .from('user_locations')
          .update({ is_sharing_location: false })
          .eq('user_id', user!.id);

        if (error) throw error;
        return false;
      }

      // 2. Enabling location sharing
      if (checked) {
        // Use cached location from context if available, otherwise fetch
        let lat = currentLocation?.latitude;
        let lng = currentLocation?.longitude;

        if (!lat || !lng) {
           await requestLocation(); // Trigger context update
           // Note: We might not have coords immediately if this is async, 
           // but the Context handles the DB update on success.
           // For immediate toggle, we optimistically proceed or throw if strictly needed.
           if (!currentLocation) throw new Error("Please enable location services first");
        }

        // Context might have updated by now if requestLocation resolved fast
        lat = lat || currentLocation!.latitude;
        lng = lng || currentLocation!.longitude;
        
        const { error } = await supabase
          .from('user_locations')
          .upsert({ 
            user_id: user!.id, 
            is_sharing_location: true,
            latitude: lat,
            longitude: lng,
            updated_at: new Date().toISOString()
          })
          .select();
        
        if (error) throw error;
        return true;
      }
      
      return false;
    },
    onSuccess: (newState) => {
      toast.success(newState ? 'Location sharing enabled' : 'Location sharing disabled');
      setIsLocating(false);
      
      queryClient.setQueryData(['profile', user!.id], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          location: { 
            ...oldData.location, 
            is_sharing_location: newState 
          }
        };
      });
    },
    onError: (error: any) => {
      const msg = error.message || "Failed to update location settings";
      toast.error(msg);
      setIsLocating(false);
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    }
  });
  
  // MODIFIED: Simplified handler to use the mutation directly
  const handleLocationToggle = (checked: boolean) => {
    setIsLocating(true);
    if (checked && !currentLocation) {
        // Trigger context request if we don't have location yet
        requestLocation().then(() => {
            // Retry mutation after request
            toggleLocationMutation.mutate({ checked });
        }).catch(() => {
            setIsLocating(false);
            toast.error("Could not access location");
        });
    } else {
        toggleLocationMutation.mutate({ checked });
    }
  };
  
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image size must be less than 5MB');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;
      await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', user!.id);
      return publicUrl;
    },
    onSuccess: () => {
      toast.success('Avatar updated successfully!');
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },
    onError: (error: any) => toast.error(error.message || 'Upload failed')
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
    },
    onSuccess: async () => {
      await signOut();
      navigate('/');
      toast.success('Account deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete account');
    }
  });

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setAvatarPreview(URL.createObjectURL(file));
      uploadAvatarMutation.mutate(file);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleReferralCopy = () => {
    const refCode = `LYNQ-${user?.id.slice(0, 6).toUpperCase()}`;
    const refLink = `${window.location.origin}/lynq-africa?ref=${refCode}`;
    navigator.clipboard.writeText(refLink);
    toast.success("Referral link copied to clipboard!");
  };

  const handleRadiusChange = (value: number[]) => setDiscoveryRadius(value);
  const saveRadius = () => {
    updateProfileMutation.mutate({ preferences: { discovery_radius: discoveryRadius[0] } });
    toast.success('Discovery radius updated');
  };

  // Calculate profile completion
  const calculateCompletion = () => {
    let completed = 0;
    const total = 5;
    if (profile?.display_name) completed++;
    if (profile?.bio && profile.bio.length > 10) completed++;
    if (profile?.avatar_url) completed++;
    if (location?.is_sharing_location) completed++;
    if (stats.friends > 0) completed++;
    return Math.round((completed / total) * 100);
  };

  const profileCompletion = calculateCompletion();

  const statsList = [
    { label: 'Friends', value: stats.friends, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Events', value: stats.events, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Messages', value: stats.messages, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-100' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pb-24">
      
      {/* HEADER SECTION */}
      <div className="relative gradient-primary text-white pb-12 pt-6 rounded-b-[2.5rem] shadow-xl overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-2xl" />
        
        <div className="container-mobile relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight">Profile</h1>
            {/* Added Refresh Button */}
            <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-white/20 rounded-full"
                  onClick={() => refetch()}
                  disabled={isRefetching}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-white hover:bg-white/20 transition-all rounded-full px-4 font-semibold"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? (
                    <><X className="w-4 h-4 mr-2" /> Cancel</>
                  ) : (
                    <><Edit3 className="w-4 h-4 mr-2" /> Edit</>
                  )}
                </Button>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="w-28 h-28 border-4 border-white/30 shadow-2xl ring-4 ring-white/10">
                <AvatarImage src={avatarPreview || profile?.avatar_url || ''} className="object-cover" />
                <AvatarFallback className="bg-white/20 text-white text-4xl font-bold backdrop-blur-md">
                  {displayName.slice(0, 2).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              
              <label className="absolute bottom-0 right-0 w-10 h-10 bg-white text-primary rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform z-10 border-4 border-primary">
                {uploadAvatarMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleAvatarSelect} 
                  disabled={uploadAvatarMutation.isPending} 
                />
              </label>
            </div>
            
            <div className="flex-1 min-w-0 space-y-2">
              {isEditing ? (
                <Input 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-white/15 border-white/30 text-white placeholder:text-white/60 h-11 rounded-xl focus-visible:ring-white/50 font-semibold"
                  placeholder="Display Name"
                  maxLength={50}
                />
              ) : (
                <h2 className="text-2xl font-bold truncate tracking-tight">{profile?.display_name || 'User'}</h2>
              )}
              <p className="text-white/90 text-sm truncate font-medium flex items-center gap-2">
                {user?.email}
              </p>
              
              <div className="flex items-center gap-2 mt-3">
                <Badge className="bg-amber-100/20 text-amber-200 border-amber-300/30 backdrop-blur-sm px-3 py-1">
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  Free Member
                </Badge>
              </div>
            </div>
          </div>

          {/* Profile Completion */}
          {profileCompletion < 100 && (
            <div className="mt-6 p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">Profile Completion</span>
                <span className="text-sm font-bold text-white">{profileCompletion}%</span>
              </div>
              <Progress value={profileCompletion} className="h-2 bg-white/20" />
              <p className="text-xs text-white/80 mt-2">
                Complete your profile to unlock all features!
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="container-mobile -mt-8 relative z-10 space-y-5">
        
        {/* 30-DAY INSIGHTS */}
        <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-card">
          <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-b px-5 pt-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <BarChart3 className="w-5 h-5 text-primary" /> 
                30-Day Analytics
              </CardTitle>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                <Zap className="w-3 h-3 mr-1" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 p-0">
            <div className="p-6 border-r flex flex-col items-center justify-center hover:bg-muted/5 transition-colors cursor-pointer group">
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-3xl font-bold text-foreground tracking-tight group-hover:scale-110 transition-transform">
                  {profile?.profile_views_30d || 0}
                </span>
                <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                  +12%
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Eye className="w-3.5 h-3.5" /> Profile Views
              </span>
            </div>
            <div className="p-6 flex flex-col items-center justify-center hover:bg-muted/5 transition-colors cursor-pointer group">
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-3xl font-bold text-foreground tracking-tight group-hover:scale-110 transition-transform">
                  {stats.event_views_30d || 0}
                </span>
                <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                  +5%
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Radar className="w-3.5 h-3.5" /> Event Reach
              </span>
            </div>
          </CardContent>
        </Card>

        {/* STATS GRID */}
        <div className="grid grid-cols-3 gap-3">
          {statsList.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card 
                key={index} 
                className="border-0 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg duration-300 cursor-pointer bg-gradient-to-br from-background to-muted/20"
              >
                <CardContent className="p-4 text-center flex flex-col items-center justify-center h-28">
                  <div className={`${stat.bg} ${stat.color} w-11 h-11 rounded-xl flex items-center justify-center mb-2 shadow-sm`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-foreground leading-none">{stat.value}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 font-semibold">
                    {stat.label}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* REFERRAL CARD */}
        <Card className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white border-0 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-16 -mb-16 blur-2xl" />
          
          <CardContent className="p-6 relative z-10">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
                <Gift className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Invite & Earn</h3>
                <p className="text-xs text-white/90 leading-relaxed">
                  Share your referral link. When friends join, you both get 7 days of Premium access!
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="bg-white/15 border border-white/30 backdrop-blur-sm rounded-xl px-4 py-3 flex-1 flex items-center justify-between">
                <span className="text-xs font-mono text-white truncate">
                  ahmia/ref/{user?.id.slice(0,6).toUpperCase()}
                </span>
              </div>
              <Button 
                size="sm" 
                variant="secondary" 
                className="text-indigo-700 font-bold shrink-0 shadow-md hover:shadow-lg transition-all px-6"
                onClick={handleReferralCopy}
              >
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* BIO SECTION */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3 px-5 pt-5">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              About Me
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write a short bio about yourself..."
                  className="resize-none bg-muted/50 min-h-[120px] focus-visible:ring-primary"
                  maxLength={200}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{bio.length}/200 characters</span>
                </div>
                <Button 
                  className="w-full gradient-primary text-white shadow-md font-semibold" 
                  onClick={() => updateProfileMutation.mutate({ displayName, bio })}
                  disabled={updateProfileMutation.isPending || !displayName.trim()}
                >
                  {updateProfileMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="mr-2 h-4 w-4" /> Save Changes</>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap min-h-[60px]">
                {profile?.bio || "No bio yet. Tap edit to tell us about yourself and connect with like-minded people!"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* SETTINGS SECTION */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground ml-1 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            App Settings
          </h3>
          <Card className="border-0 shadow-md overflow-hidden divide-y divide-border/50">
            
            {/* Discovery Slider */}
            <div className="p-5 space-y-4 bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-950/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
                    <Radar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Discovery Radius</div>
                    <div className="text-xs text-muted-foreground">
                      Max distance: <span className="font-bold text-primary">{(discoveryRadius[0] / 1000).toFixed(1)}km</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-2">
                <Slider 
                  value={discoveryRadius} 
                  onValueChange={handleRadiusChange} 
                  onValueCommit={saveRadius}
                  max={50000} 
                  step={500}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-3 font-semibold">
                  <span>0km</span>
                  <span>25km</span>
                  <span>50km</span>
                </div>
              </div>
            </div>

            {/* Location Toggle */}
            <div className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Location Sharing</div>
                  <div className="text-xs text-muted-foreground">Visible to friends on map</div>
                </div>
              </div>
              <Switch checked={!!location?.is_sharing_location}
  onCheckedChange={handleLocationToggle} disabled={toggleLocationMutation.isPending || isLocating} 
              />
            </div>

            {/* Notifications */}
            <div className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Push Notifications</div>
                  <div className="text-xs text-muted-foreground">Get notified about updates</div>
                </div>
              </div>
              <Switch 
                checked={profile?.preferences?.notifications ?? true} 
                onCheckedChange={(c) => updateProfileMutation.mutate({ preferences: { notifications: c } })} 
              />
            </div>
            
            {/* Premium Banner */}
            <div 
              className="p-5 flex items-center justify-between hover:bg-amber-50/70 dark:hover:bg-amber-900/10 transition-all cursor-pointer group border-l-4 border-l-amber-400" 
              onClick={() => navigate('/premium')}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    Lynq Premium
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xs text-amber-700/80 dark:text-amber-300/70">Unlock exclusive features & benefits</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </div>

        {/* DANGER ZONE */}
        <div className="space-y-3 pb-8">
          <h3 className="text-xs font-bold text-muted-foreground ml-1 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Account Actions
          </h3>
          <Card className="border-0 shadow-md overflow-hidden">
            <div className="divide-y divide-border/50">
              <div 
                className="p-5 flex items-center gap-3 cursor-pointer hover:bg-muted/50 text-foreground transition-colors group"
                onClick={handleSignOut}
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-muted/70 transition-colors">
                  <LogOut className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold">Sign Out</span>
                  <p className="text-xs text-muted-foreground">Log out of your account</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>

              <div 
                className="p-5 flex items-center gap-3 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 transition-colors group"
                onClick={() => setShowDeleteDialog(true)}
              >
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center group-hover:bg-red-200 dark:group-hover:bg-red-900/40 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold">Delete Account</span>
                  <p className="text-xs text-red-500/80">Permanently remove your account</p>
                </div>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Card>
        </div>

        {/* Footer Info */}
        <div className="text-center pb-8 space-y-3">
          <p className="text-xs text-muted-foreground/60 font-medium">Lynq v1.0.0 • Build 2024.11</p>
          <div className="flex justify-center gap-6 text-xs text-muted-foreground/70">
            <button className="hover:text-primary transition-colors font-medium">Terms</button>
            <button className="hover:text-primary transition-colors font-medium">Privacy</button>
            <button className="hover:text-primary transition-colors font-medium">Help</button>
          </div>
        </div>
      </div>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl">Delete Account?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base leading-relaxed">
              This action cannot be undone. This will permanently delete your account, remove all your data, 
              and you'll lose access to all your events, messages, and connections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete My Account
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
