import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Crown, Loader2, Zap, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string;
  email: string;
}

export default function PremiumFeaturesManager() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  const [featureForm, setFeatureForm] = useState({
    feature_type: 'full_package' as 'full_package' | 'profile_boost' | 'event_boost' | 'profile_badge',
    duration_days: 30,
  });

  // Fetch all users for the dropdown
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin_all_users_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as UserProfile[];
    }
  });

  // Bulk Grant Mutation
  const grantMutation = useMutation({
    mutationFn: async (payload: { userIds: string[], featureType: string, duration: number }) => {
      const { userIds, featureType, duration } = payload;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
      const isoExpiry = expiresAt.toISOString();

      const promises = userIds.map(async (uid) => {
        // Check existing
        const { data: existing } = await supabase
          .from('premium_features')
          .select('id')
          .eq('user_id', uid)
          .eq('feature_type', featureType)
          .maybeSingle();

        if (existing) {
          return supabase
            .from('premium_features')
            .update({ is_active: true, expires_at: isoExpiry, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          // Note: using 'any' to bypass strict type check on insert for this admin tool
          return supabase
            .from('premium_features')
            .insert({
              user_id: uid,
              feature_type: featureType,
              is_active: true,
              expires_at: isoExpiry
            } as any);
        }
      });

      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success(`Feature granted successfully to ${selectedUserId === 'all' ? 'all users' : 'selected user'}`);
      setSelectedUserId('');
      queryClient.invalidateQueries({ queryKey: ['user_premium_features'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to grant feature: ${error.message}`);
    }
  });

  const handleSubmit = () => {
    if (!selectedUserId) {
      toast.error("Please select a user or 'All Users'");
      return;
    }

    const targetUserIds = selectedUserId === 'all' 
      ? users.map(u => u.user_id) 
      : [selectedUserId];

    if (targetUserIds.length === 0) return;

    if (selectedUserId === 'all' && !confirm(`Are you sure you want to grant "${featureForm.feature_type}" to ALL ${users.length} users?`)) {
      return;
    }

    grantMutation.mutate({
      userIds: targetUserIds,
      featureType: featureForm.feature_type,
      duration: featureForm.duration_days
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
          <Crown className="w-8 h-8 text-amber-500" />
          Premium Features Manager
        </h2>
        <p className="text-muted-foreground">
          Centralized control to assign premium status and boosts to your community.
        </p>
      </div>

      <Card className="border-t-4 border-t-primary shadow-lg">
        <CardHeader>
          <CardTitle>Grant Feature</CardTitle>
          <CardDescription>Select the target audience and the feature type below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Target Selection */}
          <div className="space-y-3">
            <Label className="text-base">Target User(s)</Label>
            <Select 
              value={selectedUserId} 
              onValueChange={setSelectedUserId}
              disabled={isLoadingUsers}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder={isLoadingUsers ? "Loading users..." : "Select a user..."} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all" className="font-bold border-b pb-2 mb-2 text-primary">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    All Users ({users.length})
                  </div>
                </SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="text-[10px]">{user.display_name?.[0]}</AvatarFallback>
                      </Avatar>
                      <span>{user.display_name}</span>
                      <span className="text-muted-foreground text-xs ml-2">({user.email})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature Type Selection */}
            <div className="space-y-3">
              <Label className="text-base">Feature Type</Label>
              <div className="grid gap-2">
                {[
                  { id: 'full_package', label: 'Full Package', icon: Crown, desc: 'Unlocks all premium capabilities' },
                  { id: 'profile_boost', label: 'Profile Boost', icon: Zap, desc: 'Higher visibility in discovery' },
                  { id: 'event_boost', label: 'Event Boost', icon: CheckCircle2, desc: 'Promotes user events' },
                  { id: 'profile_badge', label: 'Premium Badge', icon: AlertCircle, desc: 'Visual verification badge' },
                ].map((feature) => (
                  <div 
                    key={feature.id}
                    onClick={() => setFeatureForm(prev => ({ ...prev, feature_type: feature.id as any }))}
                    className={`
                      cursor-pointer flex items-start gap-3 p-3 rounded-lg border-2 transition-all
                      ${featureForm.feature_type === feature.id 
                        ? 'border-primary bg-primary/5 shadow-sm' 
                        : 'border-transparent bg-muted hover:bg-muted/80'}
                    `}
                  >
                    <div className={`p-2 rounded-full ${featureForm.feature_type === feature.id ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                      <feature.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{feature.label}</p>
                      <p className="text-xs text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Duration Input */}
            <div className="space-y-3">
              <Label className="text-base">Duration (Days)</Label>
              <div className="relative">
                <Input
                  type="number"
                  className="h-12 text-lg"
                  value={featureForm.duration_days}
                  onChange={(e) => setFeatureForm({ ...featureForm, duration_days: Number(e.target.value) })}
                  min={1}
                  max={3650}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  days
                </span>
              </div>
              
              <Alert className="bg-muted border-none mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Summary</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-1">
                  You are granting <strong>{featureForm.feature_type.replace('_', ' ')}</strong> to 
                  <strong> {selectedUserId === 'all' ? `all ${users.length} users` : '1 selected user'} </strong>
                  for <strong>{featureForm.duration_days} days</strong>.
                </AlertDescription>
              </Alert>
            </div>
          </div>

        </CardContent>
        <CardFooter className="pt-2 pb-6">
          <Button 
            className="w-full h-12 text-lg font-medium" 
            onClick={handleSubmit}
            disabled={grantMutation.isPending || isLoadingUsers || !selectedUserId}
          >
            {grantMutation.isPending ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Crown className="w-5 h-5 mr-2" /> Grant Feature</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
