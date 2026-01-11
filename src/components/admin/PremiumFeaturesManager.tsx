import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { Crown, Loader2, Zap, Users, CheckCircle2, AlertCircle, Trash2, Calendar, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string;
  email: string;
}

interface PremiumFeature {
  id: string;
  feature_type: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export default function PremiumFeaturesManager() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("grant");
  
  // Grant State
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [featureForm, setFeatureForm] = useState({
    feature_type: 'full_package' as const,
    duration_days: 30,
  });

  // Revoke State
  const [manageUserId, setManageUserId] = useState<string>("");

  // 1. Fetch all users
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

  // 2. Fetch active features for selected user (Revoke Tab)
  const { data: activeFeatures = [], isLoading: isLoadingFeatures } = useQuery({
    queryKey: ['admin_user_features', manageUserId],
    queryFn: async () => {
      if (!manageUserId) return [];
      const { data, error } = await supabase
        .from('premium_features')
        .select('*')
        .eq('user_id', manageUserId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PremiumFeature[];
    },
    enabled: !!manageUserId && activeTab === 'revoke'
  });

  // 3. Grant Mutation
  const grantMutation = useMutation({
    mutationFn: async (payload: { userIds: string[], featureType: string, duration: number }) => {
      const { userIds, featureType, duration } = payload;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
      const isoExpiry = expiresAt.toISOString();

      const promises = userIds.map(async (uid) => {
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
      toast.success(`Feature granted successfully`);
      setSelectedUserId('');
      queryClient.invalidateQueries({ queryKey: ['admin_user_features'] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  // 4. Revoke/Delete Mutation
  const revokeMutation = useMutation({
    mutationFn: async (featureId: string) => {
      const { error } = await supabase.from('premium_features').delete().eq('id', featureId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feature revoked successfully");
      queryClient.invalidateQueries({ queryKey: ['admin_user_features', manageUserId] });
    },
    onError: (error: Error) => toast.error("Failed to revoke: " + error.message)
  });

  const handleGrant = () => {
    if (!selectedUserId) return;
    const targetUserIds = selectedUserId === 'all' ? users.map(u => u.user_id) : [selectedUserId];
    if (selectedUserId === 'all' && !confirm(`Grant to ALL ${users.length} users?`)) return;
    
    grantMutation.mutate({
      userIds: targetUserIds,
      featureType: featureForm.feature_type,
      duration: featureForm.duration_days
    });
  };

  const getFeatureIcon = (type: string) => {
    switch (type) {
      case 'full_package': return <Crown className="w-4 h-4" />;
      case 'profile_boost': return <Zap className="w-4 h-4" />;
      case 'event_boost': return <CheckCircle2 className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
          <Crown className="w-8 h-8 text-amber-500" />
          Premium Manager
        </h2>
        <p className="text-muted-foreground">Manage subscriptions and boosts.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="grant">Grant Features</TabsTrigger>
          <TabsTrigger value="revoke">Manage & Revoke</TabsTrigger>
        </TabsList>

        {/* --- GRANT TAB --- */}
        <TabsContent value="grant">
          <Card className="border-t-4 border-t-green-500 shadow-lg">
            <CardHeader>
              <CardTitle>Grant New Feature</CardTitle>
              <CardDescription>Assign features to users or the entire community.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Target User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all" className="font-bold border-b pb-2 mb-2 text-primary">
                      <div className="flex items-center gap-2"><Users className="w-4 h-4" /> All Users ({users.length})</div>
                    </SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6"><AvatarImage src={user.avatar_url} /><AvatarFallback>U</AvatarFallback></Avatar>
                          <span>{user.display_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Feature Type</Label>
                  <div className="grid gap-2">
                    {['full_package', 'profile_boost', 'event_boost', 'profile_badge'].map((id) => (
                      <div 
                        key={id}
                        onClick={() => setFeatureForm(prev => ({ ...prev, feature_type: id as any }))}
                        className={`cursor-pointer flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${featureForm.feature_type === id ? 'border-primary bg-primary/5' : 'border-transparent bg-muted hover:bg-muted/80'}`}
                      >
                        <div className={`p-2 rounded-full ${featureForm.feature_type === id ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                          {getFeatureIcon(id)}
                        </div>
                        <span className="font-medium capitalize">{id.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Duration (Days)</Label>
                  <Input type="number" className="h-12" value={featureForm.duration_days} onChange={(e) => setFeatureForm({ ...featureForm, duration_days: Number(e.target.value) })} min={1} />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full h-12" onClick={handleGrant} disabled={grantMutation.isPending || !selectedUserId}>
                {grantMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Crown className="w-5 h-5 mr-2" /> Grant Feature</>}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* --- REVOKE TAB --- */}
        <TabsContent value="revoke">
          <Card className="border-t-4 border-t-red-500 shadow-lg">
            <CardHeader>
              <CardTitle>Manage & Revoke</CardTitle>
              <CardDescription>Look up a user to see and remove their active features.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Select User to Manage</Label>
                <Select value={manageUserId} onValueChange={setManageUserId} disabled={isLoadingUsers}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Search user..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6"><AvatarImage src={user.avatar_url} /><AvatarFallback>U</AvatarFallback></Avatar>
                          <span>{user.display_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-muted/30 rounded-xl p-4 min-h-[200px]">
                {!manageUserId ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                    <Users className="w-10 h-10 mb-3 opacity-20" />
                    <p>Select a user above to view their features</p>
                  </div>
                ) : isLoadingFeatures ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
                ) : activeFeatures.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
                    <XCircle className="w-10 h-10 mb-3 opacity-20" />
                    <p>This user has no active premium features.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeFeatures.map((feature) => (
                      <div key={feature.id} className="bg-background border rounded-lg p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-full ${feature.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            {getFeatureIcon(feature.feature_type)}
                          </div>
                          <div>
                            <h4 className="font-bold capitalize text-sm">{feature.feature_type.replace('_', ' ')}</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Badge variant={feature.is_active ? "default" : "secondary"} className="h-5 text-[10px]">
                                {feature.is_active ? 'Active' : 'Expired'}
                              </Badge>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Expires: {format(new Date(feature.expires_at), 'PPP')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => {
                            if(confirm("Are you sure you want to remove this feature?")) revokeMutation.mutate(feature.id);
                          }}
                          disabled={revokeMutation.isPending}
                        >
                          {revokeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
