import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogPortal,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  MoreVertical,
  Shield,
  ShieldAlert,
  UserX,
  Volume2,
  VolumeX,
  Crown,
  Users,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CommunityModerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communityName: string;
  myRole: 'admin' | 'moderator' | 'member' | 'none';
}

interface Member {
  id: string;
  user_id: string;
  role: 'admin' | 'moderator' | 'member';
  joined_at: string;
  muted_until: string | null;
  profile: {
    display_name?: string;
    username?: string;
    email?: string;
    avatar_url?: string;
  };
  is_premium?: boolean; // ✅ Added for badge
}

type MemberAction = {
  type: 'role' | 'mute' | 'kick';
  member: Member;
  newRole?: 'admin' | 'moderator' | 'member';
  duration?: number;
};

import { PremiumBadge as VerifiedBadge } from '@/components/PremiumBadge';

const getDisplayName = (profile: any): string => {
  if (!profile) return 'Unknown User';
  if (profile.display_name?.trim()) return profile.display_name.trim();
  if (profile.username?.trim()) return profile.username.trim();
  if (profile.email) return profile.email.split('@')[0] || 'Unknown User';
  return 'Unknown User';
};

export function CommunityModerationDialog({
  isOpen,
  onClose,
  communityId,
  communityName,
  myRole,
}: CommunityModerationDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'admins' | 'mods' | 'muted'>('all');
  const [confirmAction, setConfirmAction] = useState<MemberAction | null>(null);

  const isAdmin = myRole === 'admin';
  const canModerate = isAdmin || myRole === 'moderator';

  // Fetch all members with Premium Status
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['community_members', communityId],
    queryFn: async (): Promise<Member[]> => {
      // 1. Fetch Members
      const { data: membersData, error } = await supabase
        .from('community_members')
        .select('id, user_id, role, joined_at, muted_until')
        .eq('community_id', communityId)
        .order('joined_at', { ascending: false });

      if (error) throw error;
      if (!membersData || membersData.length === 0) return [];

      const userIds = membersData.map(m => m.user_id);

      // 2. Fetch Profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, email, avatar_url')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // 3. Fetch Premium Status
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
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p]));

      return membersData.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || {},
        is_premium: premiumSet.has(m.user_id)
      })) as Member[];
    },
    enabled: isOpen && canModerate,
  });

  // Filter and categorize members
  const filteredMembers = useMemo(() => {
    if (!members) return [];
    
    let filtered = members.filter((m) => {
      const name = getDisplayName(m.profile);
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    switch (activeTab) {
      case 'admins':
        return filtered.filter((m) => m.role === 'admin');
      case 'mods':
        return filtered.filter((m) => m.role === 'moderator');
      case 'muted':
        return filtered.filter((m) => m.muted_until && new Date(m.muted_until) > new Date());
      default:
        return filtered;
    }
  }, [members, searchQuery, activeTab]);

  const stats = useMemo(() => {
    if (!members) return { total: 0, admins: 0, mods: 0, muted: 0 };
    return {
      total: members.length,
      admins: members.filter((m) => m.role === 'admin').length,
      mods: members.filter((m) => m.role === 'moderator').length,
      muted: members.filter((m) => m.muted_until && new Date(m.muted_until) > new Date()).length,
    };
  }, [members]);

  // Change member role
  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: string }) => {
      const { error } = await supabase
        .from('community_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['community_members', communityId] });
      setConfirmAction(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update role');
    },
  });

  // Mute/unmute member
  const muteMutation = useMutation({
    mutationFn: async ({ memberId, duration }: { memberId: string; duration: number | null }) => {
      const muted_until = duration 
        ? new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from('community_members')
        .update({ muted_until })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.duration ? 'Member muted' : 'Member unmuted');
      queryClient.invalidateQueries({ queryKey: ['community_members', communityId] });
      queryClient.invalidateQueries({ queryKey: ['my_membership'] }); 
      setConfirmAction(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update mute status');
    },
  });

  // Kick member
  const kickMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      // Decrement member count
      await supabase.rpc('decrement_community_members', { community_id: communityId });
    },
    onSuccess: () => {
      toast.success('Member removed from community');
      queryClient.invalidateQueries({ queryKey: ['community_members', communityId] });
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      setConfirmAction(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const handleAction = (action: MemberAction) => {
    setConfirmAction(action);
  };

  const executeAction = () => {
    if (!confirmAction) return;

    switch (confirmAction.type) {
      case 'role':
        if (confirmAction.newRole) {
          changeRoleMutation.mutate({
            memberId: confirmAction.member.id,
            newRole: confirmAction.newRole,
          });
        }
        break;
      case 'mute':
        muteMutation.mutate({
          memberId: confirmAction.member.id,
          duration: confirmAction.duration ?? null,
        });
        break;
      case 'kick':
        kickMutation.mutate(confirmAction.member.id);
        break;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Crown className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        );
      case 'moderator':
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Shield className="w-3 h-3 mr-1" />
            Moderator
          </Badge>
        );
      default:
        return null;
    }
  };

  const isMuted = (member: Member) => {
    return member.muted_until && new Date(member.muted_until) > new Date();
  };

  if (!canModerate) {
    return null;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogPortal>
          <DialogContent className="sm:max-w-[600px] max-w-[calc(100vw-2rem)] h-[85vh] flex flex-col p-0 z-[9999]">
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Manage Members
              </DialogTitle>
              <DialogDescription>
                Manage members of {communityName}
              </DialogDescription>
            </DialogHeader>
  
            {/* Stats */}
            <div className="px-6 py-3 bg-muted/30 grid grid-cols-4 gap-2 flex-shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{stats.admins}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.mods}</p>
                <p className="text-xs text-muted-foreground">Mods</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{stats.muted}</p>
                <p className="text-xs text-muted-foreground">Muted</p>
              </div>
            </div>
  
            {/* Search */}
            <div className="px-6 py-3 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
  
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-6 grid grid-cols-4 flex-shrink-0">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="admins">Admins</TabsTrigger>
                <TabsTrigger value="mods">Mods</TabsTrigger>
                <TabsTrigger value="muted">Muted</TabsTrigger>
              </TabsList>
  
              <ScrollArea className="flex-1 px-6">
                <TabsContent value={activeTab} className="mt-4 space-y-2 pb-4">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No members found</p>
                    </div>
                  ) : (
                    filteredMembers.map((member) => {
                      const isMe = member.user_id === user?.id;
                      const canModifyRole = isAdmin && !isMe;
                      const canMute = canModerate && !isMe && member.role !== 'admin';
                      const canKick = canModerate && !isMe && (isAdmin || member.role === 'member');
  
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={member.profile?.avatar_url} />
                            <AvatarFallback>
                              {getDisplayName(member.profile)[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
  
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-1">
                              <p className="font-semibold truncate">
                                {getDisplayName(member.profile)}
                                {isMe && <span className="text-xs text-muted-foreground ml-1">(You)</span>}
                              </p>
                              {/* ✅ Verified Badge */}
                              {member.is_premium && <VerifiedBadge />}
                              {getRoleBadge(member.role)}
                              {isMuted(member) && (
                                <Badge variant="destructive" className="text-xs">
                                  <VolumeX className="w-3 h-3 mr-1" />
                                  Muted
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Joined {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                            </p>
                          </div>
  
                          {!isMe && (canModifyRole || canMute || canKick) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {canModifyRole && (
                                  <>
                                    {member.role !== 'admin' && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleAction({
                                            type: 'role',
                                            member,
                                            newRole: 'admin',
                                          })
                                        }
                                      >
                                        <Crown className="w-4 h-4 mr-2" />
                                        Make Admin
                                      </DropdownMenuItem>
                                    )}
                                    {member.role !== 'moderator' && member.role !== 'admin' && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleAction({
                                            type: 'role',
                                            member,
                                            newRole: 'moderator',
                                          })
                                        }
                                      >
                                        <Shield className="w-4 h-4 mr-2" />
                                        Make Moderator
                                      </DropdownMenuItem>
                                    )}
                                    {member.role !== 'member' && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleAction({
                                            type: 'role',
                                            member,
                                            newRole: 'member',
                                          })
                                        }
                                      >
                                        <ShieldAlert className="w-4 h-4 mr-2" />
                                        Remove Role
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                  </>
                                )}
  
                                {canMute && (
                                  <>
                                    {isMuted(member) ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleAction({
                                            type: 'mute',
                                            member,
                                            duration: 0,
                                          })
                                        }
                                      >
                                        <Volume2 className="w-4 h-4 mr-2" />
                                        Unmute
                                      </DropdownMenuItem>
                                    ) : (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleAction({
                                              type: 'mute',
                                              member,
                                              duration: 1,
                                            })
                                          }
                                        >
                                          <VolumeX className="w-4 h-4 mr-2" />
                                          Mute for 1 hour
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleAction({
                                              type: 'mute',
                                              member,
                                              duration: 24,
                                            })
                                          }
                                        >
                                          <VolumeX className="w-4 h-4 mr-2" />
                                          Mute for 24 hours
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            handleAction({
                                              type: 'mute',
                                              member,
                                              duration: 168,
                                            })
                                          }
                                        >
                                          <VolumeX className="w-4 h-4 mr-2" />
                                          Mute for 7 days
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                  </>
                                )}
  
                                {canKick && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() =>
                                      handleAction({
                                        type: 'kick',
                                        member,
                                      })
                                    }
                                  >
                                    <UserX className="w-4 h-4 mr-2" />
                                    Remove from Community
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
  
            {/* Footer */}
            <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm Action
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'role' && (
                <>
                  Change {getDisplayName(confirmAction.member.profile)}'s role to{' '}
                  <strong>{confirmAction.newRole}</strong>?
                </>
              )}
              {confirmAction?.type === 'mute' && (
                <>
                  {confirmAction.duration === 0
                    ? `Unmute ${getDisplayName(confirmAction.member.profile)}?`
                    : `Mute ${getDisplayName(confirmAction.member.profile)} for ${
                        confirmAction.duration === 1
                          ? '1 hour'
                          : confirmAction.duration === 24
                          ? '24 hours'
                          : '7 days'
                      }?`}
                </>
              )}
              {confirmAction?.type === 'kick' && (
                <>
                  Remove {getDisplayName(confirmAction.member.profile)} from the community?
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              className={confirmAction?.type === 'kick' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {changeRoleMutation.isPending || muteMutation.isPending || kickMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Confirm'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
