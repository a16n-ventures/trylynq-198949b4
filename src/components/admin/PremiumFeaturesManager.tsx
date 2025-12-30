import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Crown, Search, Loader2, Plus, Calendar, X } from 'lucide-react';

interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string;
  email: string;
}

interface PremiumFeature {
  id: string;
  user_id: string;
  feature_type: 'full_package' | 'profile_boost' | 'event_boost' | 'profile_badge';
  is_active: boolean;
  expires_at: string | null;
}

export default function PremiumFeaturesManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [featureForm, setFeatureForm] = useState({
    feature_type: 'full_package' as 'full_package' | 'profile_boost' | 'event_boost' | 'profile_badge',
    duration_days: 30,
    is_active: true
  });

  // Fetch users with their premium features
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin_premium_users', search],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .order('display_name', { ascending: true })
        .limit(50);

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  // Fetch premium features for selected user
  const { data: userFeatures = [] } = useQuery({
    queryKey: ['user_premium_features', selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser) return [];
      
      const { data, error } = await supabase
        .from('premium_features')
        .select('*')
        .eq('user_id', selectedUser.user_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PremiumFeature[];
    },
    enabled: !!selectedUser
  });

  // Toggle feature status mutation
const toggleFeatureMutation = useMutation({
  mutationFn: async ({ featureId, isActive }: { featureId: string; isActive: boolean }) => {
    console.log('🔄 Toggling feature:', featureId, 'to', isActive);
    
    // 1. Update premium_features table
    const { error: featureError } = await supabase
      .from('premium_features')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', featureId);
    
    if (featureError) {
      console.error('❌ Feature update error:', featureError);
      throw featureError;
    }

    // 2. Get the feature to find user_id and type
    const { data: feature } = await supabase
      .from('premium_features')
      .select('user_id, feature_type')
      .eq('id', featureId)
      .single();

    if (!feature) throw new Error('Feature not found');

    // 3. If toggling full_package, update subscription status
    if (feature.feature_type === 'full_package') {
      console.log('💎 Updating subscription status for full_package');
      
      const { error: subError } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: feature.user_id,
          status: isActive ? 'active' : 'inactive',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (subError) {
        console.error('❌ Subscription update error:', subError);
        throw subError;
      }
    }

    // 4. Update profile verification badge if profile_badge type
    if (feature.feature_type === 'profile_badge') {
      console.log('✅ Updating verification badge');
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          is_verified: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', feature.user_id);

      if (profileError) {
        console.error('❌ Profile update error:', profileError);
        throw profileError;
      }
    }

    console.log('✅ Feature toggle completed successfully');
  },
  onSuccess: () => {
    toast.success('Feature status updated successfully');
    queryClient.invalidateQueries({ queryKey: ['user_premium_features'] });
    queryClient.invalidateQueries({ queryKey: ['admin_premium_users'] });
  },
  onError: (error: any) => {
    console.error('❌ Toggle mutation error:', error);
    toast.error(error.message || 'Failed to update feature');
  }
});

// Delete feature mutation
const deleteFeatureMutation = useMutation({
  mutationFn: async (featureId: string) => {
    console.log('🗑️ Deleting feature:', featureId);
    
    // 1. Get the feature details before deleting
    const { data: feature, error: fetchError } = await supabase
      .from('premium_features')
      .select('user_id, feature_type')
      .eq('id', featureId)
      .single();

    if (fetchError || !feature) {
      console.error('❌ Feature fetch error:', fetchError);
      throw fetchError || new Error('Feature not found');
    }

    console.log('📋 Feature details:', feature);

    // 2. If it's full_package, check if user has any other active full_package features
    if (feature.feature_type === 'full_package') {
      const { data: otherFeatures } = await supabase
        .from('premium_features')
        .select('id')
        .eq('user_id', feature.user_id)
        .eq('feature_type', 'full_package')
        .eq('is_active', true)
        .neq('id', featureId);

      // If this is the last active full_package, deactivate subscription
      if (!otherFeatures || otherFeatures.length === 0) {
        console.log('💎 Deactivating subscription (last full_package)');
        
        const { error: subError } = await supabase
          .from('subscriptions')
          .update({
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', feature.user_id);

        if (subError) {
          console.error('❌ Subscription deactivation error:', subError);
        }
      }
    }

    // 3. If it's profile_badge, remove verification
    if (feature.feature_type === 'profile_badge') {
      console.log('✅ Removing verification badge');
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          is_verified: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', feature.user_id);

      if (profileError) {
        console.error('❌ Profile update error:', profileError);
      }
    }

    // 4. Delete the feature
    const { error: deleteError } = await supabase
      .from('premium_features')
      .delete()
      .eq('id', featureId);
    
    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      throw deleteError;
    }

    console.log('✅ Feature deleted successfully');
  },
  onSuccess: () => {
    toast.success('Feature removed successfully');
    queryClient.invalidateQueries({ queryKey: ['user_premium_features'] });
    queryClient.invalidateQueries({ queryKey: ['admin_premium_users'] });
  },
  onError: (error: any) => {
    console.error('❌ Delete mutation error:', error);
    toast.error(error.message || 'Failed to remove feature');
  }
});

// Grant premium feature mutation
const grantFeatureMutation = useMutation({
  mutationFn: async ({ userId, featureType, durationDays }: { 
    userId: string; 
    featureType: string; 
    durationDays: number;
  }) => {
    console.log('🎁 Granting feature:', { userId, featureType, durationDays });
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // 1. Check if feature already exists
    const { data: existing } = await supabase
      .from('premium_features')
      .select('id')
      .eq('user_id', userId)
      .eq('feature_type', featureType)
      .maybeSingle();

    if (existing) {
      console.log('📝 Updating existing feature');
      
      // Update existing
      const { error } = await supabase
        .from('premium_features')
        .update({
          is_active: true,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      if (error) {
        console.error('❌ Update error:', error);
        throw error;
      }
    } else {
      console.log('➕ Creating new feature');
      
      // Create new
      const { error } = await supabase
        .from('premium_features')
        .insert({
          user_id: userId,
          feature_type: featureType,
          is_active: true,
          expires_at: expiresAt.toISOString()
        });
      
      if (error) {
        console.error('❌ Insert error:', error);
        throw error;
      }
    }

    // 2. If granting full_package, activate subscription
    if (featureType === 'full_package') {
      console.log('💎 Activating subscription');
      
      const { error: subError } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          status: 'active',
          plan: 'premium',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (subError) {
        console.error('❌ Subscription error:', subError);
        throw subError;
      }
    }

    // 3. If granting profile_badge, add verification
    if (featureType === 'profile_badge') {
      console.log('✅ Adding verification badge');
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          is_verified: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (profileError) {
        console.error('❌ Profile update error:', profileError);
        throw profileError;
      }
    }

    console.log('✅ Feature granted successfully');
  },
  onSuccess: () => {
    toast.success('Premium feature granted successfully');
    queryClient.invalidateQueries({ queryKey: ['user_premium_features'] });
    queryClient.invalidateQueries({ queryKey: ['admin_premium_users'] });
    setDialogOpen(false);
  },
  onError: (error: any) => {
    console.error('❌ Grant mutation error:', error);
    toast.error(error.message || 'Failed to grant feature');
  }
});

  const getFeatureBadge = (featureType: string) => {
    const badges = {
      full_package: { label: 'Full Package', color: 'bg-purple-600' },
      profile_boost: { label: 'Profile Boost', color: 'bg-blue-600' },
      event_boost: { label: 'Event Boost', color: 'bg-green-600' },
      profile_badge: { label: 'Premium Badge', color: 'bg-amber-600' }
    };
    
    const badge = badges[featureType as keyof typeof badges] || { label: featureType, color: 'bg-gray-600' };
    return <Badge className={`${badge.color} text-white`}>{badge.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Premium Features Manager</h2>
        <p className="text-muted-foreground">Grant and manage premium features for users</p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users List */}
      <div className="grid gap-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No users found
            </CardContent>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.user_id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback>{user.display_name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{user.display_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <Dialog 
                  open={dialogOpen && selectedUser?.user_id === user.user_id} 
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (open) setSelectedUser(user);
                    else setSelectedUser(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Crown className="w-4 h-4 mr-2" />
                      Manage Premium
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-primary" />
                        Manage Premium Features - {user.display_name}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6">
                      {/* Current Features */}
                      <div>
                        <h3 className="font-semibold mb-3">Current Features</h3>
                        {userFeatures.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
                            No premium features assigned
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {userFeatures.map((feature) => (
                              <Card key={feature.id} className="border">
                                <CardContent className="p-3 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {getFeatureBadge(feature.feature_type)}
                                    <div className="text-sm">
                                      <p className="font-medium">
                                        Status: <span className={feature.is_active ? 'text-green-600' : 'text-red-600'}>
                                          {feature.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                      </p>
                                      {feature.expires_at && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                          <Calendar className="w-3 h-3" />
                                          Expires: {new Date(feature.expires_at).toLocaleDateString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={feature.is_active}
                                      onCheckedChange={(checked) => 
                                        toggleFeatureMutation.mutate({ 
                                          featureId: feature.id, 
                                          isActive: checked 
                                        })
                                      }
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => deleteFeatureMutation.mutate(feature.id)}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Grant New Feature */}
                      <div className="border-t pt-4">
                        <h3 className="font-semibold mb-3">Grant New Feature</h3>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Feature Type</Label>
                            <Select 
                              value={featureForm.feature_type} 
                              onValueChange={(v: any) => setFeatureForm({ ...featureForm, feature_type: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full_package">Full Package</SelectItem>
                                <SelectItem value="profile_boost">Profile Boost</SelectItem>
                                <SelectItem value="event_boost">Event Boost</SelectItem>
                                <SelectItem value="profile_badge">Premium Badge</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Duration (Days)</Label>
                            <Input
                              type="number"
                              value={featureForm.duration_days}
                              onChange={(e) => setFeatureForm({ ...featureForm, duration_days: Number(e.target.value) })}
                              min={1}
                              max={3650}
                            />
                          </div>

                          <Button 
                            className="w-full" 
                            onClick={handleGrantFeature}
                            disabled={grantFeatureMutation.isPending}
                          >
                            {grantFeatureMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Granting...</>
                            ) : (
                              <><Plus className="w-4 h-4 mr-2" /> Grant Feature</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
