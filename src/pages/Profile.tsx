import { useState, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, MapPin, Calendar, Grid, Ticket, Store as StoreIcon,
  LogOut, Sparkles, QrCode, Share2,
  ChevronRight, Crown, Loader2, Edit2, AlertCircle, AtSign, Mail, User, Phone, Heart, Check, Trash2, Camera, Copy, Gift, Shield, ShieldCheck, Plus, Briefcase, X
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

interface UserPreferences {
  notifications: boolean;
  discovery_radius?: number;
  ghost_mode?: boolean;
  links?: ProfileLink[];
  [key: string]: any;
}

type UserType = 'personal' | 'business';
type VerificationStatus = 'unverified' | 'pending' | 'verified';

interface ProfileData {
  user_id: string;
  display_name: string;
  username: string;
  email: string;
  phone?: string | null;
  bio: string;
  avatar_url: string;
  created_at: string;
  is_premium?: boolean;
  profile_views_30d?: number;
  preferences?: UserPreferences;
  account_type: UserType;
  verification_status: VerificationStatus;
  trust_score?: number; 
  skills?: string[]; 
  interests?: string[]; 
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
      phone: profileData.phone != null ? String(profileData.phone) : null,
      preferences: preferences || { notifications: true }
    } as unknown as ProfileData : null,
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

const AdminPortalButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin']);
      return (data && data.length > 0) || false;
    },
    enabled: !!user?.id,
  });

  if (!isAdmin) return null;

  return (
    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/20 mb-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg text-primary"><Shield className="w-5 h-5" /></div>
        <div>
          <p className="font-semibold text-sm">Admin Portal</p>
          <p className="text-xs text-muted-foreground">Manage platform</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>Open</Button>
    </div>
  );
};

// --- FAVORITES TAB ---
const FavoritesTab = ({ userId, onEventClick }: { userId: string; onEventClick: (id: string) => void }) => {
  const navigate = useNavigate();

  // Load favorites from localStorage (same key as Feed.tsx)
  const favoriteIds = useMemo<string[]>(() => {
    try { 
      // Scope key directly to the active profile owner matching user.id
      return JSON.parse(localStorage.getItem(`feed_favorites_${userId}`) || '[]'); 
    }
    catch { return []; }
  }, [userId]);

  const { data: favoriteEvents = [], isLoading } = useQuery({
    queryKey: ['favorite-events', favoriteIds.join(',')],
    queryFn: async () => {
      if (favoriteIds.length === 0) return [];
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, image_url, category, ticket_price')
        .in('id', favoriteIds)
        .gt('start_date', new Date().toISOString())
        .order('start_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: favoriteIds.length > 0,
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3 p-3 bg-muted/30 rounded-xl animate-pulse">
          <div className="w-16 h-16 bg-muted rounded-xl shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  if (favoriteIds.length === 0 || favoriteEvents.length === 0) {
    return (
      <div className="text-center py-16 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Heart className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h3 className="font-semibold text-lg">No favorites yet</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Tap the heart on any event in the feed to save it here.</p>
        <Button onClick={() => navigate('/app/feed')}>Browse Events</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{favoriteEvents.length} saved event{favoriteEvents.length !== 1 ? 's' : ''}</p>
      {(favoriteEvents as any[]).map((event: any) => (
        <div
          key={event.id}
          className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-accent/5 transition-colors cursor-pointer group"
          onClick={() => onEventClick(event.id)}
        >
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-muted">
            {event.image_url
              ? <img src={event.image_url} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              : <div className="w-full h-full flex items-center justify-center"><Calendar className="w-5 h-5 text-muted-foreground/40" /></div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{event.title}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              {new Date(event.start_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            {event.ticket_price && event.ticket_price > 0 && (
              <p className="text-xs font-semibold text-primary mt-0.5">₦{event.ticket_price.toLocaleString()}</p>
            )}
          </div>
          <Heart className="w-4 h-4 fill-red-500 text-red-500 shrink-0" />
        </div>
      ))}
    </div>
  );
};

// --- PROFILE VIEWS TAB ---
const ProfileViewsTab = ({ userId, isPremium }: { userId: string; isPremium: boolean }) => {
  const navigate = useNavigate();

  const { data: recentViewers = [], isLoading } = useQuery({
    queryKey: ['profile-viewers', userId],
    queryFn: async () => {
      // Use a raw query approach since profile_views isn't in generated types yet
      const { data, error } = await supabase
        .from('profile_views' as any)
        .select('viewer_id, viewed_at')
        .eq('profile_user_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(50);

      if (error || !data) return [];

      // Fetch viewer profiles
      const viewerIds = [...new Set((data as any[]).map((v: any) => v.viewer_id))] as string[];
      if (viewerIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', viewerIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      return (data as any[]).map((v: any) => ({
        ...v,
        profile: profileMap.get(v.viewer_id) || { display_name: 'Unknown', avatar_url: null }
      }));
    },
    enabled: !!userId,
  });

  // Deduplicate by viewer_id (show latest view only)
  const uniqueViewers = useMemo(() => {
    const seen = new Set<string>();
    return recentViewers.filter((v: any) => {
      if (seen.has(v.viewer_id)) return false;
      seen.add(v.viewer_id);
      return true;
    });
  }, [recentViewers]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl animate-pulse">
            <div className="w-10 h-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (uniqueViewers.length === 0) {
    return (
      <div className="text-center py-16 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Grid className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h3 className="font-semibold text-lg">No views yet</h3>
        <p className="text-sm text-muted-foreground mt-1">When people view your profile, they'll show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        {isPremium ? `${uniqueViewers.length} unique viewer${uniqueViewers.length !== 1 ? 's' : ''} in the last 30 days` : 'Upgrade to PRO for detailed viewer analytics'}
      </p>
      {/* For non-premium: show only first 3, blurred, with "+X others" summary */}
      {(isPremium ? uniqueViewers : uniqueViewers.slice(0, 3)).map((viewer: any, idx: number) => (
        <div
          key={viewer.viewer_id + '-' + idx}
          className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-accent/5 transition-colors cursor-pointer"
          onClick={() => navigate(`/app/friends`)}
        >
          <Avatar className={`w-10 h-10 border border-border/50 transition-all ${!isPremium ? 'blur-sm select-none pointer-events-none' : ''}`}>
            <AvatarImage src={viewer.profile.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground text-sm">
              {viewer.profile.display_name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm truncate transition-all ${!isPremium ? 'blur-sm select-none' : ''}`}>
              {viewer.profile.display_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(viewer.viewed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          </div>
          {!isPremium && (
            <Badge className="bg-amber-100 text-amber-800 border-0 text-[9px]">PRO</Badge>
          )}
        </div>
      ))}
      {!isPremium && uniqueViewers.length > 3 && (
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-dashed border-border/40">
          <div className="flex -space-x-2">
            {uniqueViewers.slice(3, 6).map((v: any, i: number) => (
              <div key={i} className="w-8 h-8 rounded-full bg-muted border-2 border-background blur-sm flex items-center justify-center text-xs font-bold">
                {v.profile.display_name?.[0] || '?'}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex-1">
            <span className="font-semibold text-foreground">+{uniqueViewers.length - 3} others</span> also viewed your profile
          </p>
        </div>
      )}
      {!isPremium && uniqueViewers.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 mt-4">
          <p className="text-sm font-semibold mb-1">Want to see who viewed your profile?</p>
          <p className="text-xs text-muted-foreground mb-3">Upgrade to PRO to see full viewer details and unlock all {uniqueViewers.length} viewers.</p>
          <Button size="sm" onClick={() => navigate('/premium')} className="gap-1">
            <Crown className="w-3.5 h-3.5" /> Upgrade to PRO
          </Button>
        </Card>
      )}
    </div>
  );
};

// EventsProfileTab removed - now handled in Events page

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('tickets'); 
  const { shareInvite, referralCode } = useReferrals(); 
  
  const [showSkillsEditor, setShowSkillsEditor] = useState(false);
  const [pendingUserType, setPendingUserType] = useState<'personal' | 'business' | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  
  const SKILL_TAGS = [
    'Graphic Design','Video Editing','Photography','Social Media Management','Content Writing',
    'Web Design','Animation','Music Production','Voiceover','Illustration',
    'Web Development','Mobile App Development','Data Analysis','IT Support','Cybersecurity',
    'UI/UX Design','SEO & Marketing','AI / Automation',
    'Electrical Work','Plumbing','Carpentry','Painting & Decorating','AC Repair',
    'Generator Repair','Tiling','Masonry','Cleaning Services','Landscaping','Moving & Hauling',
    'Hair Styling','Makeup Artist','Nail Technician','Barbing','Personal Training',
    'Massage Therapy','Spa Services',
    'Event Planning','Catering','DJ / Music','MC / Host','Decoration','Security / Ushering',
    'Tutoring','Legal Services','Accounting / Bookkeeping','Business Consulting',
    'Translation','Driving / Logistics','Tailoring / Fashion','Laundry Services',
  ];
  
  // Also used for personal interest updates
  const INTEREST_TAGS = [
    'Music','Art','Sports','Gaming','Food & Drink','Travel','Fashion','Fitness',
    'Technology','Business','Politics','Education','Health','Photography','Film',
    'Books','Nature','Spirituality','Comedy','Dance','Nightlife','Volunteering',
    'Entrepreneurship','Cooking','Pets','Cars','DIY','Podcasts','Crypto','Real Estate',
  ];
  
  const updateAccountTypeMutation = useMutation({
    mutationFn: async ({ userType, skills }: { userType: 'personal' | 'business'; skills: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          account_type: userType, // 💡 THE FIX: Dynamically maps to 'business' instead of 'service'
          skills: skills
        })
        .eq('user_id', user.id);

      if (profileError) throw profileError;
    },
    onSuccess: (_, variables) => {
      toast.success(`Successfully switched to ${variables.userType} account!`);
      setShowSkillsEditor(false);
      setPendingUserType(null);
      // Invalidate the cache to instantly repaint the page as a Business layout
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (error: any) => {
      console.error('Error upgrading account type:', error);
      toast.error(error.message || 'Failed to update account type');
    }
  });
  
  const saveSkillsMutation = useMutation({
    mutationFn: async (skills: string[]) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase.from('profiles')
        .update({ skills, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Skills updated');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setShowSkillsEditor(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update skills'),
  });
  
  const saveInterestsMutation = useMutation({
    mutationFn: async (interests: string[]) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase.from('profiles')
        .update({ interests, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Interests updated');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setShowSkillsEditor(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update interests'),
  });

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
  // 🚀 FIXED: Guarantees profile structural safety preventing runtime null crashes
  const { profile, location, stats } = data || { 
    profile: {
      user_id: user?.id || '',
      display_name: 'User',
      username: 'user',
      email: user?.email || '',
      bio: '',
      avatar_url: '',
      created_at: new Date().toISOString(),
      account_type: 'personal',
      verification_status: 'unverified',
      preferences: { notifications: true, discovery_radius: 25000 }
    }, 
    location: null, 
    stats: { friends: 0, events: 0, messages: 0, event_views_30d: 0 } 
  };

  // Handle Authentication Redirect safely
  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        navigate('/ahmia');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  // Sync local radius state with fetched profile data
  useEffect(() => {
    // Only sync if profile is loaded
    if (profile) {
      if (profile.preferences?.discovery_radius) {
        const km = profile.preferences.discovery_radius / 1000;
        setLocalRadius(Math.min(25, Math.max(5, km))); // Clamp 5-25km
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

      const eventIds = attendances.map((a: any) => a.event_id);

      const [{ data: events, error: eventsError }, { data: locs }] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, start_date, image_url')
          .in('id', eventIds)
          .order('start_date', { ascending: true }),
        supabase
          .from('event_locations')
          .select('event_id, location_name')
          .in('event_id', eventIds),
      ]);

      if (eventsError) return [];
      const locByEvent = new Map((locs || []).map((l: any) => [l.event_id, l.location_name]));
      return (events || []).map((e: any) => ({ ...e, location: locByEvent.get(e.id) || 'TBA' }));
    },
    enabled: !!user?.id,
  });

  // --- 2. ACTIONS ---
  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
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
  
  const isBusiness = profile?.account_type === 'business';
  const safeSkills = Array.isArray((profile as any)?.skills) ? (profile as any).skills : [];
  const safeInterests = Array.isArray((profile as any)?.interests) ? (profile as any).interests : [];

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
                    <Button variant="outline" size="sm" onClick={() => navigate('/premium')}>Manage</Button>
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
                      max={25} // 25km max
                      min={5}  // 5km min
                      step={1}
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

                {/* Admin Portal (for admin users) */}
                <AdminPortalButton />

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
            <Avatar className="w-28 h-28 border-[6px] border-background shadow-2xl relative z-10">
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
              className="absolute bottom-0 right-0 w-10 h-10 bg-white dark:bg-slate-800 text-primary rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform z-20"
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

            {/* Premium badge shown next to name, not overlapping avatar upload button */}
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

            <Button 
              size="sm" 
              variant="outline" 
              className="rounded-full gap-2 h-9 px-4 shadow-sm bg-background hover:bg-primary/5 active:scale-95 transition-all"
              onClick={shareInvite} 
            >
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>

          {/* STATS CONTROL PANEL */}
                    {/* FIXED: Safe Structuring for Personal vs Business Controls */}
          <div className="mt-6 inline-flex items-center bg-muted/30 backdrop-blur-sm rounded-2xl p-1 border border-border/40 shadow-sm">
            {/* Friends */}
            <button 
              onClick={() => navigate('/app/friends')}
              className="flex flex-col items-center px-6 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all active:scale-95 group"
            >
              <span className="block font-bold text-lg group-hover:text-primary transition-colors">{stats?.friends || 0}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Friends</span>
            </button>
          
            <div className="w-[1px] h-8 bg-border/60" />
          
            {/* Events */}
            <button 
              onClick={() => navigate('/app/events')}
              className="flex flex-col items-center px-6 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all active:scale-95 group"
            >
              <span className="block font-bold text-lg group-hover:text-primary transition-colors">{stats?.events || 0}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Events</span>
            </button>
          
            {/* Safe Dynamic Additions for Businesses using CSS Display visibility to protect Tab indices */}
            <div className={`contents ${profile?.account_type !== 'business' ? 'hidden' : ''}`}>
              <div className="w-[1px] h-8 bg-border/60" />
              <button 
                onClick={() => navigate('/app/marketplace')}
                className="flex flex-col items-center px-6 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all active:scale-95 group"
              >
                <span className="block font-bold text-lg group-hover:text-primary transition-colors">
                  {/* Fixed data reference from stats.events to explicit count safely */}
                  {((profile as any)?.skills?.length) || 0}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Catalog</span>
              </button>
          
              <div className="w-[1px] h-8 bg-border/60" />
              <button 
                onClick={() => navigate('/app/trust-center')}
                className="flex flex-col items-center px-6 py-2 rounded-xl hover:bg-background hover:shadow-sm transition-all active:scale-95 group"
              >
                <span className="block font-bold text-lg group-hover:text-primary transition-colors">
                  {profile?.verification_status === 'verified' ? '✓' : '—'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Trust</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTENT TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-transparent border-b rounded-none h-12 px-6 gap-6 justify-start overflow-x-auto">
          <TabsTrigger
            value="tickets"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all shrink-0"
          >
            <Ticket className="w-4 h-4 mr-2" /> My Tickets
          </TabsTrigger>

          <TabsTrigger
            value="favorites"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all shrink-0"
          >
            <Heart className="w-4 h-4 mr-2" /> Favorites
          </TabsTrigger>
          
          <TabsTrigger
            value="views"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all shrink-0"
          >
            <Grid className="w-4 h-4 mr-2" /> Views
          </TabsTrigger>
          
          {/* Use CSS hidden — conditional rendering breaks Radix TabsList child indexing */}
          <TabsTrigger
            value="analytics"
            className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2 text-muted-foreground transition-all shrink-0 ${!profile.is_premium ? 'hidden' : ''}`}
          >
            <Sparkles className="w-4 h-4 mr-2" /> Insights
          </TabsTrigger>
        </TabsList>

        {/* A. MY TICKETS (Wallet View) */}
        <TabsContent value="tickets" className="p-4 space-y-4 min-h-[300px]">
          {myTickets.length > 0 ? (
            (myTickets as any[]).map((event: any) => (
            <Card 
                key={event.id}
                className="overflow-hidden border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 cursor-pointer bg-card/50 group"
                onClick={() => navigate(`/app/events/${event.id}`)}
              >
                <div className="flex">
                  {/* Use a thinner, more elegant accent line */}
                  <div className="w-1.5 bg-primary/80" /> 
                  <div className="flex-1 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="text-[10px] font-bold bg-green-500/10 text-green-600 border-none">CONFIRMED</Badge>
                    </div>
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{event.title}</h3>
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

        {/* B. FAVORITES TAB */}
        <TabsContent value="favorites" className="p-4 space-y-4 min-h-[300px]">
          <FavoritesTab userId={user!.id} onEventClick={(id) => navigate(`/app/events/${id}`)} />
        </TabsContent>

        {/* C. VIEWS TAB */}
        <TabsContent value="views" className="p-4 space-y-4 min-h-[300px]">
          <ProfileViewsTab userId={user!.id} isPremium={!!profile.is_premium} />
        </TabsContent>

        {/* D. PREMIUM INSIGHTS (Analytics for premium users) */}
        <TabsContent value="analytics" className={`p-4 space-y-4 min-h-[300px] ${!profile.is_premium ? 'hidden' : ''}`}>
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-amber-500/5 to-transparent overflow-hidden relative">
              <div className="absolute -right-8 -top-8 w-28 h-28 bg-primary/10 rounded-full blur-3xl" />
              <div className="p-5 space-y-4 relative z-10">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" /> Profile Analytics
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-[9px] ml-auto">PRO</Badge>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-xl p-4 border text-center shadow-sm">
                    <p className="text-2xl font-bold text-primary">{profile.profile_views_30d || 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">Profile Views</p>
                    <p className="text-[9px] text-muted-foreground">Last 30 days</p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border text-center shadow-sm">
                    <p className="text-2xl font-bold text-primary">{stats.event_views_30d || 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">Event Views</p>
                    <p className="text-[9px] text-muted-foreground">Last 30 days</p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border text-center shadow-sm">
                    <p className="text-2xl font-bold text-foreground">{stats.friends}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">Total Friends</p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border text-center shadow-sm">
                    <p className="text-2xl font-bold text-foreground">{stats.events}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium">Events Attended</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
                  ✨ PRO members get detailed analytics on their profile and event performance.
                </p>
              </div>
            </Card>

            {/* Subscription Management */}
            <Card className="border-border shadow-sm">
              <div className="p-5 space-y-3">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Settings className="w-5 h-5 text-muted-foreground" /> Subscription
                </h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge className="bg-amber-100 text-amber-800 border-0">PRO</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ad-Free</span>
                  <span className="font-semibold text-green-600 flex items-center gap-1"><Check className="w-4 h-4" /> Enabled</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discovery Radius</span>
                  <span className="font-semibold">Extended (75km)</span>
                </div>
                <Button variant="outline" className="w-full mt-2" onClick={() => navigate('/premium')}>
                  Manage Subscription
                </Button>
              </div>
            </Card>
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

            {/* Account Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {profile.account_type === 'business' ? <Briefcase className="w-4 h-4 text-muted-foreground" /> : <User className="w-4 h-4 text-muted-foreground" />}
                Account Type
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { if (profile.account_type !== 'personal') updateAccountTypeMutation.mutate({ userType: 'personal' }); }}
                  disabled={updateAccountTypeMutation.isPending}
                  className={`flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-semibold border transition-all ${
                    profile.account_type !== 'business'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Personal
                </button>
                <button
                  onClick={() => {
                    if (profile.account_type !== 'business') {
                      setSelectedSkills(Array.isArray(profile?.skills) ? profile.skills : []);
                      setPendingUserType('business');
                      setShowSkillsEditor(true);
                    }
                  }}
                  disabled={updateAccountTypeMutation.isPending}
                  className={`flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-semibold border transition-all ${
                    profile.account_type === 'business'
                      ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:border-cyan-400'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" /> Business
                </button>
              </div>
            </div>

            {/* Skills — business only */}
            {isBusiness && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-cyan-500" />
                    Services / Skills
                    <span className="text-muted-foreground font-normal">({safeSkills.length})</span>
                  </Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-xs text-cyan-600 px-2" 
                    onClick={() => { 
                      setSelectedSkills(safeSkills); 
                      setShowSkillsEditor(true); 
                    }}>
                    Edit
                  </Button>
                </div>
            
                {safeSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {safeSkills.slice(0, 6).map((skill: string) => (
                      <Badge key={skill} variant="secondary" className="text-[10px] bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200">
                        {skill}
                      </Badge>
                    ))}
                    {safeSkills.length > 6 && (
                      <Badge variant="outline" className="text-[10px]">+{safeSkills.length - 6} more</Badge>
                    )}
                  </div>
                ) : (
                  <button 
                    onClick={() => { setSelectedSkills([]); setShowSkillsEditor(true); }}
                    className="w-full h-9 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-cyan-400 hover:text-cyan-600 transition-colors">
                    + Add skills
                  </button>
                )}
              </div>
            )}

            {/* Interests — personal only */}
            {/* Interests — personal only */}
            {!isBusiness && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-muted-foreground" />
                    Interests
                    <span className="text-muted-foreground font-normal">({safeInterests.length})</span>
                  </Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-xs text-primary px-2" 
                    onClick={() => { 
                      setSelectedSkills(safeInterests); // Reuse the same modal state
                      setShowSkillsEditor(true);
                    }}>
                    Edit
                  </Button>
                </div>
            
                {safeInterests.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {safeInterests.slice(0, 6).map((interest: string) => (
                      <Badge key={interest} variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                        {interest}
                      </Badge>
                    ))}
                    {safeInterests.length > 6 && (
                      <Badge variant="outline" className="text-[10px]">+{safeInterests.length - 6} more</Badge>
                    )}
                  </div>
                ) : (
                  <button 
                    onClick={() => { setSelectedSkills([]); setShowSkillsEditor(true); }}
                    className="w-full h-9 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    + Add interests
                  </button>
                )}
              </div>
            )}
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
      <Dialog open={showSkillsEditor} onOpenChange={(open) => { if (!open) { setShowSkillsEditor(false); setPendingUserType(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingUserType === 'business' || profile?.account_type === 'business'
                ? <><Briefcase className="w-5 h-5 text-cyan-500" /> {pendingUserType === 'business' ? 'Set Up Business Profile' : 'Edit Skills'}</>
                : <><Heart className="w-5 h-5 text-primary" /> Edit Interests</>}
            </DialogTitle>
          </DialogHeader>
      
          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">{selectedSkills.length} selected</span>
            {selectedSkills.length > 0 && (
              <button onClick={() => setSelectedSkills([])} className="text-xs text-muted-foreground hover:text-destructive">Clear all</button>
            )}
          </div>
      
          {selectedSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1 py-2 bg-muted/30 rounded-xl border border-border/50">
              {selectedSkills.map((s) => (
                <button key={s} onClick={() => setSelectedSkills(prev => prev.filter(x => x !== s))}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white transition-colors ${
                    pendingUserType === 'business' || profile?.account_type === 'business' ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-primary hover:bg-primary/90'
                  }`}>
                  {s} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
      
          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            <div className="flex flex-wrap gap-2 py-2">
              {(pendingUserType === 'business' || profile?.account_type === 'business' ? SKILL_TAGS : INTEREST_TAGS)
                .filter(s => !selectedSkills.includes(s))
                .map((tag) => (
                  <button key={tag} onClick={() => setSelectedSkills(prev => [...prev, tag])}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-full border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all">
                    {tag}
                  </button>
                ))}
            </div>
          </div>
      
          <DialogFooter className="pt-3 border-t gap-2">
            <Button variant="outline" onClick={() => { setShowSkillsEditor(false); setPendingUserType(null); }}>Cancel</Button>
            <Button
              className={`flex-1 text-white ${pendingUserType === 'business' || profile?.account_type === 'business' ? 'bg-cyan-500 hover:bg-cyan-600' : ''}`}
              disabled={selectedSkills.length === 0 || updateAccountTypeMutation.isPending || saveSkillsMutation.isPending || saveInterestsMutation.isPending}
              onClick={() => {
                if (pendingUserType === 'business') {
                  updateAccountTypeMutation.mutate({ userType: 'business', skills: selectedSkills });
                } else if (profile?.account_type === 'business') {
                  saveSkillsMutation.mutate(selectedSkills);
                } else {
                  saveInterestsMutation.mutate(selectedSkills);
                }
              }}
            >
              {(updateAccountTypeMutation.isPending || saveSkillsMutation.isPending || saveInterestsMutation.isPending)
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                : pendingUserType === 'business' ? 'Switch to Business' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Profile;
