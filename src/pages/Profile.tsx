import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, MapPin, Calendar, Grid, Ticket,
  LogOut, Sparkles, QrCode, Share2,
  ChevronRight, Crown, Loader2, Edit2, AlertCircle, AtSign, Mail, User, Phone, Heart, Check, Trash2, Camera, Copy, Gift
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReferrals } from '@/hooks/useReferrals';

// --- TYPES ---
interface ProfileLink {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

interface ProfileData {
  user_id: string;
  display_name: string;
  username: string;
  email: string;
  phone?: string | number | null;
  bio: string;
  avatar_url: string;
  created_at: string;
  profile_views_30d?: number;
  preferences?: {
    notifications: boolean;
    discovery_radius?: number;
    ghost_mode?: boolean; // Kept this from your new file
    links?: ProfileLink[];
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
  const preferences = profileData?.preferences as any || {};

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

const ReferralSection = () => {
  const {
    referralCode,
    referralSettings,
    stats,
    isLoading,
    copyReferralCode,
    shareInvite
  } = useReferrals();

  // Don't render if referrals are disabled
  if (!referralSettings?.enabled) return null;

  return (
    <div className="pt-4 space-y-4 border-t border-border/50">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
        <Gift className="w-3.5 h-3.5" />
        Invite Friends & Earn
      </div>

      {/* Referral Code Card */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-xl p-4 border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Your Referral Code</p>
            {isLoading ? (
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-xl font-bold text-primary tracking-wider">{referralCode || 'N/A'}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={copyReferralCode}
              disabled={!referralCode}
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="default"
              className="h-9 w-9 rounded-full"
              onClick={shareInvite}
              disabled={!referralCode}
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-primary/10">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{stats?.total_referrals ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Invited</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">{stats?.completed_referrals ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Joined</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-primary">₦{(stats?.total_earnings ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Earned</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Earn ₦{referralSettings?.reward_amount || 500} for each friend who joins using your code!
      </p>
    </div>
  );
};

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('tickets');

  // Local state for smooth slider dragging
  const [localRadius, setLocalRadius] = useState<number>(25);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Profile Settings Dialog State
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    display_name: '',
    username: '',
    email: '',
    bio: '',
    phone: '' // Added missing field
  });

  // --- 1. DATA FETCHING (Fixed) ---
  const { data, isLoading: isProfileLoading, error, refetch } = useQuery<CombinedProfile, Error>({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfileData(user!.id),
    enabled: !!user?.id,
    staleTime: STALE_TIME,
    refetchInterval: REFETCH_INTERVAL,
    retry: 2,
  });

  // Destructure safely to handle cases where profile is still creating
  const { profile, location, stats } = data || { 
    profile: null, 
    location: null, 
    stats: { friends: 0, events: 0, messages: 0, event_views_30d: 0 } 
  };

  // Handle Authentication Redirect safely
  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        navigate('/auth');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  // Sync local radius state with fetched profile data
  useEffect(() => {
    // Only sync if profile is loaded
    if (profile) {
      if (profile.preferences?.discovery_radius) {
        setLocalRadius(profile.preferences.discovery_radius / 1000); // Convert meters to km
      }

      // Always sync form data when profile is loaded
      setSettingsForm({
        display_name: profile.display_name || '',
        username: profile.username || '',
        email: profile.email || user?.email || '',
        bio: profile.bio || '',
        phone: profile.phone || ''
      });
    }
  }, [profile, user?.email]);

  // Profile Settings Update Mutation (Unified)
  const updateProfileSettingsMutation = useMutation({
    mutationFn: async (updates: {
      display_name?: string;
      username?: string;
      email?: string;
      phone?: string;
      bio?: string;
    }) => {
      const dbUpdates: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.display_name !== undefined) {
        const trimmedName = updates.display_name.trim();
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

        if (checkError && (checkError as any).code !== 'PGRST116') throw checkError;
        if (existingUser) throw new Error('Username is already taken');

        dbUpdates.username = trimmedUsername;
      }

      // Updated Email Logic
      if (updates.email !== undefined) {
        const trimmedEmail = updates.email.trim().toLowerCase();
        if (!trimmedEmail) throw new Error('Email cannot be empty');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) throw new Error('Please enter a valid email address');

        if (trimmedEmail !== user?.email?.toLowerCase()) {
          const { error: authError } = await supabase.auth.updateUser({
            email: trimmedEmail
          });
          if (authError) throw authError;
          dbUpdates.email = trimmedEmail;
        }
      }

      // Bio Logic
      if (updates.bio !== undefined) {
        dbUpdates.bio = updates.bio.trim();
      }

      // Phone Logic
      if (updates.phone !== undefined) {
        dbUpdates.phone = updates.phone.trim();
      }

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('user_id', user!.id);

      if (error) throw error;
      return dbUpdates;
    },
    onSuccess: (updates) => {
      toast.success('Profile updated successfully!');
      setShowProfileSettings(false);

      // FIXED: Update the nested 'profile' object inside CombinedProfile
      queryClient.setQueryData(['profile', user!.id], (oldData: CombinedProfile | undefined) => {
        if (!oldData || !oldData.profile) return oldData;
        return {
          ...oldData,
          profile: {
            ...oldData.profile,
            ...updates,
            preferences: updates.preferences || oldData.profile.preferences
          }
        };
      });

      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    },

    onError: (error: Error) => {
      toast.error((error && error.message) || 'Failed to update profile');
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

      if (avatarPreview) {
        try { URL.revokeObjectURL(avatarPreview); } catch (e) { /* noop */ }
      }

      // FIXED: Update nested profile object
      queryClient.setQueryData(['profile', user!.id], (oldData: CombinedProfile | undefined) => {
        if (!oldData || !oldData.profile) return oldData;
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
      toast.error((error && error.message) || 'Upload failed');

      // Revoke preview url to avoid leaks
      if (avatarPreview) {
        try { URL.revokeObjectURL(avatarPreview); } catch (e) { /* noop */ }
      }
      setAvatarPreview(null);
    }
  });

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
      toast.error((error && error.message) || 'Failed to delete account');
    }
  });

  // Handlers
  const handleAvatarSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
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

    // note: cleanup of preview URL is handled in the mutation callbacks (onSuccess/onError)
  }, [uploadAvatarMutation]);

  const handleProfileSettingsSave = useCallback(() => {
    updateProfileSettingsMutation.mutate({
      display_name: settingsForm.display_name,
      username: settingsForm.username,
      email: settingsForm.email,
      phone: settingsForm.phone,
      bio: settingsForm.bio,
    });
  }, [settingsForm, updateProfileSettingsMutation]);

  const { data: myTickets = [] } = useQuery({
    queryKey: ['my-tickets', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: attendances, error: attError } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      if (attError || !attendances?.length) return [];

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_date, location, image_url')
        .in('id', attendances.map((a: any) => a.event_id))
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true });

      if (eventsError) return [];
      return events || [];
    },
    enabled: !!user?.id,
  });

  // --- 2. ACTIONS ---
  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const updatePreference = async (key: string, value: any) => {
    if (!user?.id || !profile) return;

    // Create new preferences object merging existing ones safely
    const currentPrefs = (profile.preferences || {}) as UserPreferences;
    const newPreferences = {
      ...currentPrefs,
      [key]: value
    };

    // Optimistic cache update
    queryClient.setQueryData(['profile', user.id], (old: CombinedProfile | undefined) => {
      if (!old || !old.profile) return old;
      return {
        ...old,
        profile: {
          ...old.profile,
          preferences: newPreferences
        }
      };
    });

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: newPreferences })
      .eq('user_id', user?.id);

    if (error) {
      toast.error('Failed to save preference');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      return;
    }

    if (key !== 'discovery_radius') {
      toast.success("Preference updated");
    }
  };

  // --- 3. LOADING & ERROR STATES ---

  // Combined loading check to prevent blank screen
  const isPageLoading = isProfileLoading || !user;

  if (isPageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {!user ? 'Authenticating...' : 'Loading profile...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Failed to load profile</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {(error && (error as any).message) || 'Profile not found'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button onClick={() => navigate('/app/feed')}>
              Go to Feed
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || 'User';
  const username = profile.username || 'user';

  // Safely access properties
  const isGhostMode = profile.preferences?.ghost_mode === true;

  return (
    <div className="min-h-screen bg-background pb-24">

      {/* 1. HEADER (Identity) */}
      <div className="relative">
        {/* Cover Image Placeholder */}
        <div className="h-36 bg-gradient-to-r from-primary/10 via-purple-500/10 to-orange-500/10 w-full" />

        {/* Settings Dialog (FIXED) */}
        <div className="absolute top-4 right-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="rounded-full bg-background/50 backdrop-blur-md hover:bg-background/80 shadow-sm border border-white/20">
                <Settings className="w-5 h-5 text-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Account Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Account</h3>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Crown className="w-5 h-5" /></div>
                      <div>
                        <p className="font-semibold text-sm">Premium Plan</p>
                        <p className="text-xs text-muted-foreground">{profile.is_premium ? 'Active' : 'Free Tier'}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/app/premium')}>Manage</Button>
                  </div>

                  <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-foreground hover:bg-transparent p-0 font-semibold"
                        onClick={() => setShowProfileSettings(true)}
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                      </Button>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Preferences Section (FIXED) */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discovery</h3>

                  {/* Radius Slider */}
                  <div className="space-y-4 px-1">
                    <div className="flex justify-between text-sm">
                      <Label>Max Distance</Label>
                      <span className="text-muted-foreground font-mono">{localRadius}km</span>
                    </div>
                    <Slider
                      value={[localRadius]}
                      max={75} // 75km max
                      min={25}
                      step={10}
                      // 1. Update visual state immediately
                      onValueChange={(val) => setLocalRadius(val[0])}
                      // 2. Commit to DB only when user stops dragging
                      onValueCommit={(val) => updatePreference('discovery_radius', val[0] * 1000)}
                    />
                  </div>

                  {/* Ghost Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <Label className="flex flex-col gap-1">
                      <span>Ghost Mode</span>
                      <span className="font-normal text-xs text-muted-foreground">Hide location on map</span>
                    </Label>
                    <Switch
                      checked={isGhostMode} // Controlled component
                      onCheckedChange={(v) => updatePreference('ghost_mode', v)}
                    />
                  </div>
                </div>

                {/* Referrals Section (ADDED) */}
                <ReferralSection />

                {/* Actions & Danger Zone */}
                <div className="pt-2 border-t space-y-3">
                  <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </Button>

                  <div className="pt-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Account
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Avatar & Info */}
        <div className="px-6 -mt-12 mb-6">
          <div className="relative inline-block">
            <Avatar className="w-24 h-24 border-[4px] border-background shadow-xl">
              <AvatarImage
                src={avatarPreview || profile?.avatar_url || ''}
                className="object-cover"
                alt={`${profile?.display_name}'s avatar`}
              />
              <AvatarFallback className="text-2xl bg-muted text-muted-foreground">{displayName.slice(0, 2).toUpperCase() || '?'}</AvatarFallback>
            </Avatar>

            {/* Avatar upload button */}
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 w-10 h-10 bg-white dark:bg-slate-800 text-primary rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform"
            >
              {uploadAvatarMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={handleAvatarSelect}
              disabled={uploadAvatarMutation.isPending}
              aria-label="Upload avatar"
            />

            {profile.is_premium && (
              <div className="absolute bottom-0 right-0 translate-y-6 translate-x-[-2.25rem] bg-gradient-to-r from-amber-400 to-orange-500 text-white p-1.5 rounded-full border-[3px] border-background/10">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {displayName}
                {profile.is_premium && <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] px-1.5 h-5 hover:bg-amber-200">PRO</Badge>}
              </h1>
              <p className="text-muted-foreground text-sm font-medium">@{username}</p>
              {profile.bio && <p className="text-sm mt-3 text-foreground/80 leading-relaxed max-w-xs">{profile.bio}</p>}
            </div>

            <Button size="sm" variant="outline" className="rounded-full gap-2 h-9 px-4 shadow-sm bg-background">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>

          {/* Social Stats */}
          <div className="flex gap-8 mt-6 pb-4 border-b border-dashed border-border/60">
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => navigate('/app/friends')}>
              <span className="block font-bold text-lg">{stats.friends}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Friends</span>
            </div>
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
              <span className="block font-bold text-lg">{myTickets.length}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Events</span>
            </div>
            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
              <span className="block font-bold text-lg">84</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Score</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTENT TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-transparent border-b rounded-none h-12 px-6 gap-8 justify-start">
          <TabsTrigger
            value="tickets"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all"
          >
            <Ticket className="w-4 h-4 mr-2" /> My Tickets
          </TabsTrigger>
          <TabsTrigger
            value="moments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all"
          >
            <Grid className="w-4 h-4 mr-2" /> Moments
          </TabsTrigger>
        </TabsList>

        {/* A. MY TICKETS (Wallet View) */}
        <TabsContent value="tickets" className="p-4 space-y-4 min-h-[300px]">
          {myTickets.length > 0 ? (
            (myTickets as any[]).map((event: any) => (
              <Card
                key={event.id}
                className="overflow-hidden border-l-[6px] border-l-primary shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-card/50"
                onClick={() => navigate(`/app/events/${event.id}`)}
              >
                <div className="flex">
                  <div className="flex-1 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200">CONFIRMED</Badge>
                    </div>
                    <h3 className="font-bold truncate text-base">{event.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" /> {new Date(event.start_date).toLocaleDateString()}</span>
                      <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1.5 text-primary" /> {event.location || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="w-20 bg-muted/40 flex flex-col items-center justify-center border-l border-dashed border-border/60">
                    <QrCode className="w-8 h-8 text-foreground/20" />
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Ticket className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold text-lg">No tickets yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">You haven't RSVP'd to any events.</p>
              <Button onClick={() => navigate('/app/feed')}>Find Events</Button>
            </div>
          )}
        </TabsContent>

        {/* B. MOMENTS (Grid View) */}
        <TabsContent value="moments" className="p-1 min-h-[300px]">
          <div className="grid grid-cols-3 gap-1">
            {/* Placeholder for future photo feature */}
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="aspect-square bg-muted/30 relative group cursor-pointer overflow-hidden">
                <img src={`https://picsum.photos/seed/${i + (user?.id || '')}/400/400`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="moment" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Profile Settings Dialog */}
      <Dialog open={showProfileSettings} onOpenChange={setShowProfileSettings}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[85vh] overflow-y-auto">
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
                placeholder="Barack Musa"
                value={settingsForm.display_name}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, display_name: e.target.value }))}
                maxLength={MAX_NAME_LENGTH}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {settingsForm.display_name.length}/{MAX_NAME_LENGTH} characters
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
                placeholder="username_1234"
                value={settingsForm.username}
                onChange={(e) => setSettingsForm(prev => ({
                  ...prev,
                  username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                }))}
                maxLength={MAX_USERNAME_LENGTH}
                className="h-11 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>

            {/* Bio - MOVED HERE */}
            <div className="space-y-2">
              <Label htmlFor="settings-bio" className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-muted-foreground" />
                About Me
              </Label>
              <Textarea
                id="settings-bio"
                value={settingsForm.bio}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Write a short bio about yourself..."
                className="resize-none min-h-[100px]"
                maxLength={MAX_BIO_LENGTH}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{settingsForm.bio.length}/{MAX_BIO_LENGTH} characters</span>
              </div>
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
                placeholder="name@example.com"
                value={settingsForm.email}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, email: e.target.value }))}
                className="h-11"
              />
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Changing your email will require verification
              </p>
            </div>

             {/* Phone (Added) */}
             <div className="space-y-2">
              <Label htmlFor="settings-phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="settings-phone"
                type="tel"
                placeholder="+234..."
                value={settingsForm.phone}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, phone: e.target.value }))}
                className="h-11"
              />
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
              disabled={updateProfileSettingsMutation.isPending || !settingsForm.display_name.trim() || !settingsForm.username.trim() || !settingsForm.email.trim()}
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