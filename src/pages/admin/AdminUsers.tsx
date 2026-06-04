import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { Search, MoreHorizontal, Shield, ShieldAlert, UserX, CheckCircle, Loader2, Users, UserCheck, Ban, RefreshCw, Eye, Mail, Copy } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// --- Types ---
type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  is_banned: boolean | null;
  created_at: string;
  bio?: string | null;
};

type UserRole = {
  user_id: string;
  role: 'user' | 'moderator' | 'admin' | 'super_admin';
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  // Ban dialog state
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [banReason, setBanReason] = useState("");

  // Stats Query
  const { data: stats } = useQuery({
    queryKey: ['admin_user_stats'],
    queryFn: async () => {
      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const since5m = new Date(now - 5 * 60 * 1000).toISOString();

      // Active = distinct users with real, user-driven app activity.
      // IDs are unioned via Set to dedupe a user that appears in multiple signals
      // (e.g. same user pings location, sends a message, RSVPs, and checks-in).
      // Signals: location pings, messages, social posts/comments, event RSVPs
      // (event_attendees), events created, and check-ins. We also track a
      // separate "Active Now" pool using the last 5 minutes.
      const [
        { count: totalUsers },
        { count: bannedUsers },
        locationsRes,
        messagesRes,
        postsRes,
        commentsRes,
        rsvpsRes,
        eventsRes,
        checkinsRes,
        locationsNowRes,
        messagesNowRes,
        checkinsNowRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
        supabase.from('user_locations').select('user_id').gte('updated_at', since24h).limit(1000),
        supabase.from('messages').select('sender_id').gte('created_at', since24h).limit(1000),
        supabase.from('social_posts').select('user_id').gte('created_at', since24h).limit(1000),
        supabase.from('post_comments').select('user_id').gte('created_at', since24h).limit(1000),
        supabase.from('event_attendees').select('user_id').gte('created_at', since24h).limit(1000),
        (supabase.from('events') as any).select('creator_id').gte('created_at', since24h).limit(1000),
        (supabase.from('checkins') as any).select('user_id').gte('created_at', since24h).limit(1000),
        supabase.from('user_locations').select('user_id').gte('updated_at', since5m).limit(1000),
        supabase.from('messages').select('sender_id').gte('created_at', since5m).limit(500),
        (supabase.from('checkins') as any).select('user_id').gte('created_at', since5m).limit(500),
      ]);

      const addAll = (set: Set<string>, rows: any[] | null | undefined, key: string) =>
        (rows || []).forEach((r: any) => r?.[key] && set.add(r[key]));

      const activeSet = new Set<string>();
      addAll(activeSet, locationsRes.data, 'user_id');
      addAll(activeSet, messagesRes.data, 'sender_id');
      addAll(activeSet, postsRes.data, 'user_id');
      addAll(activeSet, commentsRes.data, 'user_id');
      addAll(activeSet, rsvpsRes.data, 'user_id');
      addAll(activeSet, eventsRes.data, 'creator_id');
      addAll(activeSet, checkinsRes.data, 'user_id');

      const nowSet = new Set<string>();
      addAll(nowSet, locationsNowRes.data, 'user_id');
      addAll(nowSet, messagesNowRes.data, 'sender_id');
      addAll(nowSet, checkinsNowRes.data, 'user_id');

      return {
        total: totalUsers || 0,
        banned: bannedUsers || 0,
        activeToday: activeSet.size,
        activeNow: nowSet.size,
      };
    },
    refetchInterval: 60_000,
  });

  // 1. Fetch Users
  const { data: users = [], isLoading, refetch } = useQuery<UserProfile[]>({
    queryKey: ['admin_users', search, page],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email, is_banned, created_at, bio')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        toast.error("Failed to load users");
        throw error;
      }
      return (data || []) as UserProfile[];
    },
    placeholderData: keepPreviousData
  });

  // 2. Fetch user roles
  const { data: userRoles = {} } = useQuery<Record<string, string>>({
    queryKey: ['admin_user_roles', users.map(u => u.user_id)],
    queryFn: async () => {
      if (users.length === 0) return {};
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', users.map(u => u.user_id));
      
      const roleMap: Record<string, string> = {};
      data?.forEach(r => { roleMap[r.user_id] = r.role; });
      return roleMap;
    },
    enabled: users.length > 0
  });

  // 3. Mutation: Update Role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string, newRole: string }) => {
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole as any })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast.success(`User role updated to ${variables.newRole}`);
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      queryClient.invalidateQueries({ queryKey: ['admin_user_roles'] });
    },
    onError: (error: any) => toast.error("Failed to update role: " + error.message)
  });

  // 4. Mutation: Ban User (Enhanced with Optimistic Updates)
  const banUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string, reason: string }) => {
      // Try to save the reason if the column exists, otherwise standard ban
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_banned: true,
          // Un-comment the next line if you have added a 'ban_reason' column to your profiles table
          // ban_reason: reason 
        })
        .eq('user_id', userId);

      if (error) throw error;
    },
    onMutate: async ({ userId }) => {
      // 1. Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['admin_users'] });

      // 2. Snapshot the previous value
      const previousUsers = queryClient.getQueryData<UserProfile[]>(['admin_users', search, page]);

      // 3. Optimistically update the user in the cache
      queryClient.setQueryData(['admin_users', search, page], (old: UserProfile[] | undefined) => 
        old ? old.map(u => u.user_id === userId ? { ...u, is_banned: true } : u) : []
      );

      // 4. Close dialog immediately for better UX
      setBanDialogOpen(false);
      setSelectedUser(null);
      setBanReason("");

      return { previousUsers };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousUsers) {
        queryClient.setQueryData(['admin_users', search, page], context.previousUsers);
      }
      toast.error("Failed to ban user: " + err.message);
    },
    onSuccess: () => {
      toast.success("User has been banned");
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      queryClient.invalidateQueries({ queryKey: ['admin_user_stats'] });
    }
  });

  // 5. Mutation: Unban User (Enhanced with Optimistic Updates)
  const unbanUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_banned: false,
          // Un-comment next line if you want to clear the reason on unban
          // ban_reason: null 
        })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['admin_users'] });
      
      const previousUsers = queryClient.getQueryData<UserProfile[]>(['admin_users', search, page]);

      queryClient.setQueryData(['admin_users', search, page], (old: UserProfile[] | undefined) => 
        old ? old.map(u => u.user_id === userId ? { ...u, is_banned: false } : u) : []
      );

      return { previousUsers };
    },
    onError: (err, userId, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(['admin_users', search, page], context.previousUsers);
      }
      toast.error("Failed to unban user: " + err.message);
    },
    onSuccess: () => {
      toast.success("User has been unbanned");
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      queryClient.invalidateQueries({ queryKey: ['admin_user_stats'] });
    }
  });

  // --- Helpers ---
  const getRoleBadge = (role: string | undefined) => {
    switch (role) {
      case 'super_admin': return <Badge className="bg-purple-600 hover:bg-purple-700">Super Admin</Badge>;
      case 'admin': return <Badge className="bg-indigo-500 hover:bg-indigo-600">Admin</Badge>;
      case 'moderator': return <Badge className="bg-blue-500 hover:bg-blue-600">Moderator</Badge>;
      default: return <Badge variant="secondary">User</Badge>;
    }
  };

  const handleBanClick = (user: UserProfile) => {
    setSelectedUser(user);
    setBanDialogOpen(true);
  };

  const confirmBan = () => {
    if (selectedUser) {
      banUserMutation.mutate({ userId: selectedUser.user_id, reason: banReason });
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage access, roles, and account status.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Today</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.activeToday || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Banned</CardTitle>
            <Ban className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.banned || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input 
          placeholder="Search by name or email..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0"
        />
      </div>

      {/* Data Table */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.user_id} className={user.is_banned ? 'bg-red-50' : ''}>
                  <TableCell className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>{user.display_name?.slice(0,2).toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.display_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{user.email || 'No email'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getRoleBadge(userRoles[user.user_id])}
                  </TableCell>
                  <TableCell>
                    {user.is_banned ? (
                      <Badge variant="destructive" className="flex w-fit items-center gap-1">
                        <UserX className="w-3 h-3" /> Banned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="flex w-fit items-center gap-1 text-green-600 border-green-200 bg-green-50">
                        <CheckCircle className="w-3 h-3" /> Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user.user_id)}>
                          <Copy className="mr-2 h-4 w-4" /> Copy User ID
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => window.open(`/app/profile/${user.user_id}`, '_blank')}>
                          <Eye className="mr-2 h-4 w-4" /> View Profile
                        </DropdownMenuItem>
                        
                        <DropdownMenuSeparator />
                        
                        {/* Role Management */}
                        <DropdownMenuLabel className="text-xs">Change Role</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'user' })}
                          disabled={!userRoles[user.user_id] || userRoles[user.user_id] === 'user'}
                        >
                          Demote to User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'moderator' })}>
                          <Shield className="mr-2 h-4 w-4" /> Make Moderator
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'admin' })}>
                          <ShieldAlert className="mr-2 h-4 w-4" /> Make Admin
                        </DropdownMenuItem>
                        
                        <DropdownMenuSeparator />
                        
                        {/* Ban/Unban */}
                        {user.is_banned ? (
                          <DropdownMenuItem 
                            className="text-green-600"
                            onClick={() => unbanUserMutation.mutate(user.user_id)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" /> Unban User
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleBanClick(user)}
                          >
                            <UserX className="mr-2 h-4 w-4" /> Ban User
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, (stats?.total || 0))} of {stats?.total || 0}
        </p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || isLoading}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setPage(p => p + 1)}
            disabled={users.length < pageSize || isLoading}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Ban Confirmation Dialog */}
      <AlertDialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban User: {selectedUser?.display_name}</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the user from accessing the platform. They will see a "banned" message when trying to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for ban (optional)</label>
            <Textarea 
              placeholder="Enter reason for banning this user..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBan}
              className="bg-red-600 hover:bg-red-700"
              disabled={banUserMutation.isPending}
            >
              {banUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserX className="w-4 h-4 mr-2" />}
              Confirm Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
