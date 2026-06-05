import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { 
  Search, Users, MoreVertical, Shield, UserX, LogOut, 
  AlertCircle, Ban, VolumeX, AlertTriangle, Crown, Pin,
  Camera, Loader2, Image as ImageIcon
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SelectedChat, CommunityMember, ModerationType } from '@/types/messages';
import { ModerationDialog } from '@/components/messages/ModerationDialog';

interface CommunityInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  community: SelectedChat | null;
  coverUrl?: string;
  onCoverUpdate?: (newUrl: string) => void;
}

import { PremiumBadge as VerifiedBadge } from '@/components/PremiumBadge';

export const CommunityInfoDialog: React.FC<CommunityInfoDialogProps> = ({
  isOpen,
  onClose,
  community,
  coverUrl,
  onCoverUpdate
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('info');
  const [memberSearch, setMemberSearch] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  
  // Moderation state
  const [showModDialog, setShowModDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<CommunityMember | null>(null);
  const [modAction, setModAction] = useState<ModerationType>('kick');

  // ✅ FIXED: Robust fetching strategy + Premium Check
  const { data: members = [] } = useQuery({
    queryKey: ['comm_members', community?.id],
    queryFn: async () => {
      if (!community || community.type !== 'community') return [];
      
      // 1. Get Members
      const { data: memberData, error: memberError } = await supabase
        .from('community_members')
        .select('user_id, role, joined_at')
        .eq('community_id', community.id)
        .order('role', { ascending: true });
        
      if (memberError) throw memberError;
      if (!memberData || memberData.length === 0) return [];

      const userIds = memberData.map(m => m.user_id);

      // 2. Get Profiles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);
        
      if (profileError) throw profileError;

      // 3. Get Premium Status
      const { data: premiumFeatures } = await supabase
        .from('premium_features')
        .select('user_id')
        .in('user_id', userIds)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('user_id')
        .in('user_id', userIds)
        .eq('status', 'active');

      const premiumSet = new Set<string>();
      premiumFeatures?.forEach(pf => premiumSet.add(pf.user_id));
      subscriptions?.forEach(s => premiumSet.add(s.user_id));

      // 4. Merge Data
      const profileMap = new Map(profileData?.map(p => [p.user_id, p]));
      
      return memberData.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || { display_name: 'Unknown User', avatar_url: null },
        is_premium: premiumSet.has(m.user_id)
      })) as (CommunityMember & { is_premium?: boolean })[];
    },
    enabled: isOpen && !!community && community.type === 'community'
  });

  const canModerate = community?.type === 'community' && (community.my_role === 'admin' || community.my_role === 'moderator');
  const isAdmin = community?.type === 'community' && community.my_role === 'admin';

  // Filter members based on search
  const activeMembers = members.filter(m => 
    m.profile?.display_name?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !community || !user) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WEBP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setIsUploadingCover(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `community-covers/${community.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      onCoverUpdate?.(data.publicUrl);
      toast.success("Cover image updated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload cover image");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const updateRole = useMutation({
    mutationFn: async ({ uid, role }: { uid: string; role: string }) => {
      if (!community) return;
      await supabase
        .from('community_members')
        .update({ role })
        .eq('community_id', community.id)
        .eq('user_id', uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_members'] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update role")
  });

  const leaveCommunity = useMutation({
    mutationFn: async () => {
      if (!community || !user) return;
      await supabase
        .from('community_members')
        .delete()
        .eq('community_id', community.id)
        .eq('user_id', user.id);
    },
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to leave community")
  });

  const openModDialog = (member: CommunityMember, action: ModerationType) => {
    setSelectedMember(member);
    setModAction(action);
    setShowModDialog(true);
  };

  if (!community || community.type !== 'community') return null;

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-3 h-3 text-amber-500" />;
      case 'moderator': return <Shield className="w-3 h-3 text-blue-500" />;
      default: return null;
    }
  };

  const displayCover = coverUrl || community.avatar;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden bg-background z-[9999]">
          {/* Header with cover image */}
          <div className="relative h-40 w-full flex-shrink-0 bg-muted overflow-hidden group">
            {displayCover ? (
              <img 
                src={displayCover} 
                alt="Community cover" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            
            {isAdmin && (
              <div className="absolute top-3 right-3">
                <input 
                  type="file" 
                  ref={coverInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverUpload}
                />
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="bg-background/80 backdrop-blur-sm hover:bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploadingCover}
                >
                  {isUploadingCover ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Camera className="w-4 h-4 mr-2" />
                  )}
                  {displayCover ? 'Change Cover' : 'Add Cover'}
                </Button>
              </div>
            )}
            
            <div className="absolute -bottom-6 left-6 flex items-end gap-4">
              <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl rounded-2xl">
                <AvatarImage src={community.avatar} />
                <AvatarFallback className="text-2xl rounded-2xl bg-primary/10">
                  {community.name[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Community info */}
          <div className="px-6 pt-8 pb-2 flex-shrink-0">
            <h2 className="text-2xl font-bold">{community.name}</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" /> {members.length} Members
              </span>
              {community.my_role !== 'member' && community.my_role !== 'none' && (
                <Badge variant="secondary" className="capitalize">{community.my_role}</Badge>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b">
              <TabsList className="bg-transparent h-10 p-0 gap-6">
                <TabsTrigger 
                  value="info" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="members" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2"
                >
                  Members
                </TabsTrigger>
                {canModerate && (
                  <TabsTrigger 
                    value="moderation" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2"
                  >
                    Moderation
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent value="info" className="flex-1 p-6 overflow-y-auto m-0">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">About</h3>
                  <p className="text-sm leading-relaxed">{community.description || "No description provided."}</p>
                </div>
                
                {canModerate && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{members.length}</p>
                      <p className="text-xs text-muted-foreground">Total Members</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{members.filter(m => m.role === 'moderator' || m.role === 'admin').length}</p>
                      <p className="text-xs text-muted-foreground">Moderators</p>
                    </div>
                  </div>
                )}

                {community.my_role !== 'admin' && community.my_role !== 'none' && (
                  <Button variant="destructive" className="w-full sm:w-auto" onClick={() => leaveCommunity.mutate()}>
                    <LogOut className="w-4 h-4 mr-2" /> Leave Community
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="flex-1 flex flex-col overflow-hidden m-0">
              <div className="p-4 border-b bg-muted/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search members..." 
                    className="pl-9 bg-background" 
                    value={memberSearch} 
                    onChange={e => setMemberSearch(e.target.value)} 
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y">
                  {activeMembers.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No members found.
                    </div>
                  ) : activeMembers.map(m => (
                    <div key={m.user_id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={m.profile?.avatar_url || undefined} />
                          <AvatarFallback>{m.profile?.display_name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm flex items-center gap-2">
                            {m.profile?.display_name || 'Unknown User'}
                            {/* ✅ Added Verified Badge */}
                            {m.is_premium && <VerifiedBadge />}
                            {getRoleIcon(m.role)}
                            {m.user_id === user?.id && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">You</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                        </div>
                      </div>
                      
                      {canModerate && m.user_id !== user?.id && m.role !== 'admin' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Manage Member</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            
                            {isAdmin && (
                              <>
                                {m.role === 'member' && (
                                  <DropdownMenuItem onClick={() => updateRole.mutate({ uid: m.user_id, role: 'moderator' })}>
                                    <Shield className="w-4 h-4 mr-2" /> Promote to Mod
                                  </DropdownMenuItem>
                                )}
                                {m.role === 'moderator' && (
                                  <DropdownMenuItem onClick={() => updateRole.mutate({ uid: m.user_id, role: 'member' })}>
                                    <UserX className="w-4 h-4 mr-2" /> Demote to Member
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                              </>
                            )}
                            
                            <DropdownMenuItem onClick={() => openModDialog(m, 'warn')}>
                              <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" /> Warn
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openModDialog(m, 'mute')}>
                              <VolumeX className="w-4 h-4 mr-2 text-yellow-600" /> Mute
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-orange-600" 
                              onClick={() => openModDialog(m, 'kick')}
                            >
                              <AlertCircle className="w-4 h-4 mr-2" /> Kick
                            </DropdownMenuItem>
                            {isAdmin && (
                              <DropdownMenuItem 
                                className="text-destructive" 
                                onClick={() => openModDialog(m, 'ban')}
                              >
                                <Ban className="w-4 h-4 mr-2" /> Ban
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Moderation Tab */}
            {canModerate && (
              <TabsContent value="moderation" className="flex-1 p-6 overflow-y-auto my-0">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">
                      Moderation Tools
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manage community members and enforce community guidelines.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <h4 className="font-medium">Warnings</h4>
                          <p className="text-xs text-muted-foreground">Send official warnings to members</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                          <VolumeX className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                          <h4 className="font-medium">Mute Members</h4>
                          <p className="text-xs text-muted-foreground">Temporarily prevent members from messaging</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                          <Ban className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <h4 className="font-medium">Ban Management</h4>
                          <p className="text-xs text-muted-foreground">Permanently remove problematic members</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <Pin className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium">Pinned Messages</h4>
                          <p className="text-xs text-muted-foreground">Pin important announcements</p>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="p-4 border rounded-lg bg-card">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">Cover Image</h4>
                            <p className="text-xs text-muted-foreground">Customize community appearance</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={isUploadingCover}
                          >
                            {isUploadingCover ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Upload'
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Moderation Action Dialog */}
      <ModerationDialog
        isOpen={showModDialog}
        onClose={() => setShowModDialog(false)}
        communityId={community.id}
        member={selectedMember}
        actionType={modAction}
      />
    </>
  );
};
