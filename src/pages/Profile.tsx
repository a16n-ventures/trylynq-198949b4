import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { 
  Edit3, MapPin, Users, Camera, Bell, LogOut, Crown, Trash2,
  Loader2, Gift, Copy, Radar, BarChart3, Eye, Share2, ChevronRight,
  Shield, Check, X, Calendar, MessageSquare, Heart, Star, Zap,
  AlertCircle, RefreshCw, Settings, AtSign, Mail, User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { useGeolocation } from '@/contexts/LocationContext';

// --- TYPES ---
interface ProfileData {
  user_id: string;
  display_name: string;
  username: string;
  email: string;
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

// --- CONSTANTS ---
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_BIO_LENGTH = 200;
const MAX_NAME_LENGTH = 50;
const MAX_USERNAME_LENGTH = 30;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const REFETCH_INTERVAL = 30000; // 30 seconds
const STALE_TIME = 120000; // 2 minutes

// --- HELPERS ---
const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Please select a valid image (JPEG, PNG, WebP, or GIF)' };
  }
  if (file.size > MAX_AVATAR_SIZE) {
    return { valid: false, error: 'Image must be less than 5MB' };
  }
  return { valid: true };
};

const getAvatarPath = (url: string): string | null => {
  const match = url.match(/\/avatars\/(.+)$/);
  return match ? match[1] : null;
};

// --- DATA FETCHING ---
const fetchProfileData = async (userId: string): Promise<CombinedProfile> => {
  const [
    { data: profileData, error: profileError },
    { data: locationData },
    { count: friendCount },
    { count: eventCount },
    { count: messageCount },
    { data: eventViewsData }
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_locations').select('is_sharing_location').eq('user_id', userId).maybeSingle(),
    supabase.from('friendships').select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId),
    supabase.from('events').select('event_views_30d').eq('creator_id', userId)
  ]);

  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  
  const totalEventViews = eventViewsData?.reduce((acc, curr) => acc + (curr.event_views_30d || 0), 0) || 0;
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

// --- COMPONENT ---
const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { location: currentLocation, requestLocation, isLoading: locationLoading } = useGeolocation();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [discoveryRadius, setDiscoveryRadius] = useState([5000]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Profile Settings Dialog State
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    fullName: '',
    username: '',
    email: ''
  });

  // Query with optimized settings
  const { data, isLoading, refetch, isRefetching, error } = useQuery<CombinedProfile, Error>({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfileData(user!.id),
    enabled: !!user,
    staleTime: STALE_TIME,
    refetchInterval: REFETCH_INTERVAL,
    retry: 2,
    retryDelay: 1000,
  });

  const { profile, location, stats } = data || { 
    profile: null, 
    location: null, 
    stats: { friends: 0, events: 0, messages: 0, event_views_30d: 0 } 
  };

  const { data: hasPremiumBadge } = useQuery({
    queryKey: ['premium_badge', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      // Check if super_admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (roleData?.role === 'super_admin') return true;
      
      // Check if has premium badge feature
      const { data: badgeData } = await supabase
        .from('premium_features')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('feature_type', 'profile_badge')
        .eq('is_active', true)
        .maybeSingle();
      
      return !!badgeData;
    },
    enabled: !!user
  });

  // Sync form state with profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      const radius = profile.preferences?.discovery_radius ?? 5000;
      setDiscoveryRadius([radius]);
      
      // Sync settings form
      setSettingsForm({
        fullName: profile.display_name || '',
        username: profile.username || '',
        email: profile.email || user?.email || ''
      });
    }
  }, [profile, user?.email]);

  // Profile Settings Update Mutation
  const updateProfileSettingsMutation = useMutation({
    mutationFn: async (updates: { fullName?: string; username?: string; email?: string }) => {
      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.fullName !== undefined) {
        const trimmedName = updates.fullName.trim();
        if (!trimmedName) throw new Error('Full name cannot be empty');
        if (trimmedName.length < 2) throw new Error('Full name must be at least 2 characters');
        if (trimmedName.length > MAX_NAME_LENGTH) throw new Error(`Full name must be less than ${MAX_NAME_LENGTH} characters`);
        dbUpdates.display_name = trimmedName;
      }
      
      if (updates.username !== undefined) {
        const trimmedUsername = updates.username.trim().toLowerCase();
        if (!trimmedUsername) throw new Error('Username cannot be empty');
        if (trimmedUsername.length < 3) throw new Error('Username must be at least 3 characters');
        if (trimmedUsername.length > MAX_USERNAME_LENGTH) throw new Error(`Username must be less than ${MAX_USERNAME_LENGTH} characters`);
        if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
          throw new Error('Username can only contain lowercase letters, numbers, and underscores');
        }
        
        // Check username uniqueness
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', trimmedUsername)
          .neq('user_id', user!.id)
          .maybeSingle();
        
        if (checkError && checkError.code !== 'PGRST116') throw checkError;
        if (existingUser) throw new Error('Username is already taken');
        
        dbUpdates.username = trimmedUsername;
      }

      if (updates.email !== undefined) {
        const trimmedEmail = updates.email.trim().toLowerCase();
        if (!trimmedEmail) throw new Error('Email cannot be empty');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) throw new Error('Please enter a valid email address');
        
        // Update auth email
        const { error: authError } = await supabase.auth.updateUser({ 
          email: trimmedEmail 
        });
        if (authError) throw authError;
        
        dbUpdates.email = trimmedEmail;
      }

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('user_id', user!.id);
        
      if (error) throw error;
      return dbUpdates;
    },
    onSuccess: (updates) => {
      toast.success('Profile settings updated successfully!');
      setShowProfileSettings(false);
      
      // Optimistic update
      queryClient.setQueryData(['profile', user!.id], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          profile: {
            ...oldData.profile,
            ...updates
          }
        };
      });
      
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile settings');
    }
  });

  // Enhanced profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { displayName?: string; bio?: string; preferences?: any }) => {
      const currentPrefs = profile?.preferences || {};
      const newPrefs = { ...currentPrefs, ...updates.preferences };

      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
        preferences: newPrefs,
      };

      if (updates.displayName !== undefined) {
        const trimmedName = updates.displayName.trim();
        if (!trimmedName) throw new Error('Display name cannot be empty');
        dbUpdates.display_name = trimmedName;
      }
      
      if (updates.bio !== undefined) {
        dbUpdates.bio = updates.bio.trim();
      }

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('user_id', user!.id);
        
      if (error) throw error;
      return dbUpdates;
    },
    onSuccess: (updates) => {
      toast.success('Profile updated successfully');
      setIsEditing(false);
      
      // Optimistic update
      queryClient.setQueryData(['profile', user!.id], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          profile: {
            ...oldData.profile,
            ...updates
          }
        };
      });
      
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to update: ' + error.message);
    }
  });

  // Enhanced avatar upload mutation with proper error handling
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;
      
      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = getAvatarPath(profile.avatar_url);
        if (oldPath && !oldPath.includes('default')) {
          await supabase.storage.from('avatars').remove([oldPath]);
        }
      }
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { 
          upsert: true,
          contentType: file.type 
        });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user!.id);
      
      if (updateError) throw updateError;
      
      return publicUrl;
    },
    onSuccess: (newAvatarUrl) => {
      toast.success('Avatar updated successfully!');
      
      // Immediate cache update for instant UI feedback
      queryClient.setQueryData(['profile', user!.id], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          profile: {
            ...oldData.profile,
            avatar_url: newAvatarUrl
          }
        };
      });
      
      setAvatarPreview(null);
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Upload failed');
      setAvatarPreview(null);
    }
  });

  // Enhanced location toggle with proper async handling
  const toggleLocationMutation = useMutation({
    mutationFn: async ({ checked, coords }: { checked: boolean; coords?: { lat: number; lng: number } }) => {
      if (!user) throw new Error("User not authenticated");

      console.log('🔄 Updating location sharing:', { checked, hasCoords: !!coords });

      if (checked) {
        // ✅ ENABLING: Include coordinates (required)
        if (!coords) {
          throw new Error("Coordinates required to enable location sharing");
        }

        const payload = {
          user_id: user.id,
          is_sharing_location: true,
          latitude: coords.lat,
          longitude: coords.lng,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('user_locations')
          .upsert(payload, { 
            onConflict: 'user_id',
            ignoreDuplicates: false 
          });
        
        if (error) throw error;

      } else {
        // ✅ DISABLING: Only update the toggle, don't touch coordinates
        const { error } = await supabase
          .from('user_locations')
          .update({ 
            is_sharing_location: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        
        if (error) throw error;
      }

      console.log('✅ Location sharing updated successfully:', checked);
      return checked;
    },
    onSuccess: (newState) => {
      toast.success(newState ? 'Location sharing enabled' : 'Location sharing disabled');
      
      // Update cache immediately
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

      // Only reload if enabling (to restart LocationContext)
      if (newState) {
        setTimeout(() => window.location.reload(), 500);
      }
    },
    onError: (error: any) => {
      console.error('❌ Failed to toggle location:', error);
      toast.error(error.message || "Failed to update location settings");
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    }
  });
  
  // Improved location toggle handler
  const handleLocationToggle = useCallback(async (checked: boolean) => {
    try {
      if (checked) {
        // Enabling - need coordinates
        let coords = currentLocation ? {
          lat: currentLocation.latitude,
          lng: currentLocation.longitude
        } : null;

        if (!coords) {
          console.log('📍 No current location, requesting...');
          await requestLocation();
          
          // Wait for location to be available
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (!currentLocation) {
            throw new Error("Could not access location services. Please enable location permissions in your browser.");
          }
          
          coords = {
            lat: currentLocation.latitude,
            lng: currentLocation.longitude
          };
        }

        console.log('📍 Enabling location sharing with coords:', coords);
        toggleLocationMutation.mutate({ checked: true, coords });
      } else {
        // Disabling - no coordinates needed
        console.log('📍 Disabling location sharing');
        toggleLocationMutation.mutate({ checked: false });
      }
    } catch (error: any) {
      console.error('❌ Location toggle error:', error);
      toast.error(error.message || "Could not access location");
    }
  }, [currentLocation, requestLocation, toggleLocationMutation]);

  // Delete account mutation with cascade handling
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
    },
    onSuccess: async () => {
      await signOut();
      navigate('/', { replace: true });
      toast.success('Account deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete account');
    }
  });

  // Handlers
  const handleAvatarSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    uploadAvatarMutation.mutate(file);

    // Cleanup
    return () => URL.revokeObjectURL(previewUrl);
  }, [uploadAvatarMutation]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Failed to sign out');
    }
  }, [signOut, navigate]);

  const handleReferralCopy = useCallback(() => {
    const refCode = `AHM-${user?.id.slice(0, 6).toUpperCase()}`;
    const refLink = `${window.location.origin}/ahmia?ref=${refCode}`;
    navigator.clipboard.writeText(refLink).then(() => {
      toast.success("Referral link copied!");
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  }, [user?.id]);

  const saveRadius = useCallback(() => {
    console.log('🔵 saveRadius called with:', discoveryRadius[0]);
    updateProfileMutation.mutate({ 
      preferences: { discovery_radius: discoveryRadius[0] }
    }, {
      onSuccess: () => {
        console.log('✅ Radius saved successfully');
        toast.success(`Discovery radius set to ${(discoveryRadius[0] / 1000).toFixed(1)}km`);
      },
      onError: (error) => {
        console.error('❌ Failed to save radius:', error);
      }
    });
  }, [discoveryRadius, updateProfileMutation]);

  const handleRadiusChange = useCallback((value: number[]) => {
    console.log('Slider changed to:', value[0]);
    setDiscoveryRadius(value);
  }, []);

  const handleProfileSettingsSave = useCallback(() => {
    updateProfileSettingsMutation.mutate({
      fullName: settingsForm.fullName,
      username: settingsForm.username,
      email: settingsForm.email
    });
  }, [settingsForm, updateProfileSettingsMutation]);

  // Memoized calculations
  const profileCompletion = useMemo(() => {
    let completed = 0;
    const total = 5;
    if (profile?.display_name) completed++;
    if (profile?.bio && profile.bio.length > 10) completed++;
    if (profile?.avatar_url) completed++;
    if (location?.is_sharing_location) completed++;
    if (stats.friends > 0) completed++;
    return Math.round((completed / total) * 100);
  }, [profile, location, stats]);

  const statsList = useMemo(() => [
    { label: 'Friends', value: stats.friends, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Events', value: stats.events, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Messages', value: stats.messages, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-100' }
  ], [stats]);

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Failed to Load Profile</h2>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button onClick={() => refetch()} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-2xl" />
        
        <div className="container-mobile relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight">Profile</h1>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/20 rounded-full"
                onClick={() => refetch()}
                disabled={isRefetching}
                aria-label="Refresh profile"
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
                <AvatarImage 
                  src={avatarPreview || profile?.avatar_url || ''} 
                  className="object-cover" 
                  alt={`${displayName}'s avatar`}
                />
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
                  accept={ALLOWED_IMAGE_TYPES.join(',')}
                  className="hidden" 
                  onChange={handleAvatarSelect} 
                  disabled={uploadAvatarMutation.isPending}
                  aria-label="Upload avatar"
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
                  maxLength={MAX_NAME_LENGTH}
                  aria-label="Display name"
                />
              ) : (
                <>
                {/* ✅ ADDED: Premium Badge beside name */}
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold truncate tracking-tight">
                    {profile?.display_name || 'User'}
                  </h2>
                  {hasPremiumBadge && (
                    <div className="relative group">
                      <svg 
                        viewBox="0 0 24 24" 
                        className="w-5 h-5 text-blue-400" 
                        fill="currentColor"
                      >
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                        <circle cx="12" cy="12" r="3" fill="white" />
                      </svg>
                      {/* Tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-black/90 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Verified Premium
                      </div>
                    </div>
                  )}
                </div>
                </>
              )}
              <p className="text-white/90 text-sm truncate font-medium flex items-center gap-2">
                {user?.email}
              </p>
              
              <div className="flex items-center gap-2 mt-3">
                <Badge className="bg-amber-100/20 text-amber-200 border-amber-300/30 backdrop-blur-sm px-3 py-1">
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  {hasPremiumBadge ? 'Premium Member' : 'Free Member'}
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
                  maxLength={MAX_BIO_LENGTH}
                  aria-label="Bio"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{bio.length}/{MAX_BIO_LENGTH} characters</span>
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
                  onValueCommit={() => {
                    console.log('💾 Slider committed, saving:', discoveryRadius[0]);
                    saveRadius();
                  }}
                  onPointerUp={() => {
                    console.log('👆 Pointer up, saving radius');
                    saveRadius();
                  }}
                  max={75000} 
                  step={500}
                  min={25000}
                  className="cursor-pointer"
                  aria-label="Discovery radius"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-3 font-semibold">
                  <span>25km</span>
                  <span>50km</span>
                  <span>75km</span>
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
                  <div className="text-xs text-muted-foreground">
                    {locationLoading ? 'Requesting location...' : 'Visible to friends on map'}
                  </div>
                </div>
              </div>
              <Switch 
                checked={!!location?.is_sharing_location}
                onCheckedChange={handleLocationToggle}
                disabled={toggleLocationMutation.isPending || locationLoading}
                aria-label="Toggle location sharing"
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
                disabled={updateProfileMutation.isPending}
                aria-label="Toggle notifications"
              />
            </div>

            {/* Premium Banner */}
{!hasPremiumBadge && (
  <div 
    className="p-5 flex items-center justify-between hover:bg-amber-50/70 dark:hover:bg-amber-900/10 transition-all cursor-pointer group border-l-4 border-l-amber-400" 
    onClick={() => navigate('/premium')}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && navigate('/premium')}
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
        <Crown className="w-5 h-5" />
      </div>
      <div>
        <div className="font-semibold text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
          Ahmia Premium
          <Star className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <div className="text-xs text-amber-700/80 dark:text-amber-300/70">Unlock exclusive features & benefits</div>
      </div>
    </div>
    <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-1 transition-transform" />
  </div>
)}
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
              {/* Profile Settings Button - NEW */}
              <div 
                className="p-5 flex items-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all group"
                onClick={() => setShowProfileSettings(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setShowProfileSettings(true)}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/30 text-blue-600 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/40 transition-colors">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Profile Settings</span>
                  <p className="text-xs text-blue-700/80 dark:text-blue-300/70">Update your name, username & email</p>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-1 transition-transform" />
              </div>

              <div 
                className="p-5 flex items-center gap-3 cursor-pointer hover:bg-muted/50 text-foreground transition-colors group"
                onClick={handleSignOut}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleSignOut()}
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setShowDeleteDialog(true)}
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
          <p className="text-xs text-muted-foreground/60 font-medium">Ahmia v1.0.0 • Build 2024.11</p>
          <div className="flex justify-center gap-6 text-xs text-muted-foreground/70">
            <button className="hover:text-primary transition-colors font-medium">Terms</button>
            <button className="hover:text-primary transition-colors font-medium">Privacy</button>
            <button className="hover:text-primary transition-colors font-medium">Help</button>
          </div>
        </div>
      </Card>

      {/* Profile Settings Dialog - NEW */}
      <Dialog open={showProfileSettings} onOpenChange={setShowProfileSettings}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Profile Settings
            </DialogTitle>
            <DialogDescription>
              Update your profile information. Changes will be reflected across the platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="settings-fullname" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Full Name
              </Label>
              <Input
                id="settings-fullname"
                type="text"
                placeholder="John Doe"
                value={settingsForm.fullName}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, fullName: e.target.value }))}
                maxLength={MAX_NAME_LENGTH}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {settingsForm.fullName.length}/{MAX_NAME_LENGTH} characters
              </p>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="settings-username" className="flex items-center gap-2">
                <AtSign className="w-4 h-4 text-muted-foreground" />
                Username
              </Label>
              <Input
                id="settings-username"
                type="text"
                placeholder="barack_300"
                value={settingsForm.username}
                onChange={(e) => setSettingsForm(prev => ({ 
                  ...prev, 
                  username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') 
                }))}
                maxLength={MAX_USERNAME_LENGTH}
                className="h-11 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only • {settingsForm.username.length}/{MAX_USERNAME_LENGTH} characters
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="settings-email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email Address
              </Label>
              <Input
                id="settings-email"
                type="email"
                placeholder="barack@example.com"
                value={settingsForm.email}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, email: e.target.value }))}
                className="h-11"
              />
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Changing your email will require verification
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowProfileSettings(false)}
              disabled={updateProfileSettingsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProfileSettingsSave}
              disabled={updateProfileSettingsMutation.isPending || !settingsForm.fullName.trim() || !settingsForm.username.trim() || !settingsForm.email.trim()}
              className="gradient-primary text-white"
            >
              {updateProfileSettingsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
