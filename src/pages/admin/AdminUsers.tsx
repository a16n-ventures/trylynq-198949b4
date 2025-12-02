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
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, Shield, ShieldAlert, UserX, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// --- Types ---
type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: string | null;
  is_banned: boolean | null;
  created_at: string;
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // 1. Fetch Users
  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['admin_users', search, page],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email, role, is_banned, created_at')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.ilike('display_name', `%${search}%`);
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

  // 2. Mutation: Update Role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string, newRole: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole as any })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User role updated");
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
    onError: () => toast.error("Failed to update role")
  });

  // 3. Mutation: Ban/Unban
  const toggleBanMutation = useMutation({
    mutationFn: async ({ userId, currentStatus }: { userId: string, currentStatus: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !currentStatus })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.currentStatus ? "User unbanned" : "User banned");
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
    onError: () => toast.error("Failed to update ban status")
  });

  // --- Helpers ---
  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'super_admin': return <Badge className="bg-purple-600 hover:bg-purple-700">Super Admin</Badge>;
      case 'admin': return <Badge className="bg-indigo-500 hover:bg-indigo-600">Admin</Badge>;
      case 'moderator': return <Badge className="bg-blue-500 hover:bg-blue-600">Mod</Badge>;
      default: return <Badge variant="secondary">User</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage access, roles, and account status.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input 
          placeholder="Search by name..." 
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
                <TableRow key={user.user_id}>
                  <TableCell className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>{user.display_name?.slice(0,2).toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.display_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">ID: {user.user_id.slice(0,8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getRoleBadge(user.role)}
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
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user.user_id)}>
                          Copy User ID
                        </DropdownMenuItem>
                        
                        {/* Role Management */}
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'moderator' })}>
                          <Shield className="mr-2 h-4 w-4" /> Make Moderator
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'admin' })}>
                          <ShieldAlert className="mr-2 h-4 w-4" /> Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: user.user_id, newRole: 'user' })}>
                          Demote to User
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem 
                          className={user.is_banned ? "text-green-600" : "text-red-600"}
                          onClick={() => toggleBanMutation.mutate({ userId: user.user_id, currentStatus: !!user.is_banned })}
                        >
                          {user.is_banned ? (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" /> Unban User
                            </>
                          ) : (
                            <>
                              <UserX className="mr-2 h-4 w-4" /> Ban User
                            </>
                          )}
                        </DropdownMenuItem>
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
      <div className="flex justify-end gap-2">
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
  );
}
