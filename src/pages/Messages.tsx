import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { 
  Search, Send, ArrowLeft, Plus, Settings, Users, 
  MessageSquare, X, Loader2, 
  MoreVertical, Phone, Video, Info, UserPlus,
  Shield, Trash2, Ban, Crown, Image as ImageIcon,
  Check, AlertCircle
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// --- TYPES ---
type ChatMode = 'dm' | 'community';

interface Message {
  id: string;
  content?: string | null;
  image_url?: string | null;
  created_at: string;
  sender_id: string;
  is_me: boolean;
  sender_name?: string;
  sender_avatar?: string;
  is_deleted?: boolean;
  pending?: boolean; // For optimistic updates
}

interface CommunityMember {
  user_id: string;
  role: 'admin' | 'moderator' | 'member';
  profile: { display_name: string; avatar_url: string; };
  joined_at: string;
}

type SelectedChat = 
  | { type: 'dm'; id: string; partner_id: string; name: string; avatar?: string; is_online?: boolean; }
  | { 
      type: 'community'; 
      id: string; 
      name: string; 
      avatar?: string; 
      description?: string; 
      my_role: 'admin' | 'moderator' | 'member' | 'none'; 
      member_count: number;
    };

// --- HELPER: Safe Date Formatting ---
const formatTime = (dateString?: string) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  } catch (e) {
    return '';
  }
};

const formatMessageTime = (dateString?: string) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

// --- HOOKS ---

// Hook to handle auto-scrolling
const useScrollToBottom = (messages: Message[]) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    // Logic: If user is close to bottom OR it's a new message from me, scroll to bottom
    const isCloseToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
    const lastMessage = messages[messages.length - 1];
    const isMe = lastMessage?.is_me;

    if (isCloseToBottom || isMe) {
        // Use timeout to allow DOM to render image placeholders
        setTimeout(() => {
            scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.id]);

  return scrollRef;
};

// Hook for Real-time subscriptions
const useChatRealtime = (selectedChat: SelectedChat | null, userId: string | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedChat || !userId) return;

    const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
    const filter = selectedChat.type === 'dm' 
      ? `or(and(sender_id.eq.${userId},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${userId}))`
      : `community_id=eq.${selectedChat.id}`;

    const channel = supabase
      .channel(`chat_${selectedChat.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: table, filter: selectedChat.type === 'community' ? filter : undefined },
        (payload: RealtimePostgresChangesPayload<any>) => {
          // Verify DM filter manually since complex OR filters aren't fully supported in realtime subscribe string
          if (selectedChat.type === 'dm') {
            const newItem = payload.new;
            const isRelevant = (newItem.sender_id === userId && newItem.receiver_id === selectedChat.partner_id) ||
                               (newItem.sender_id === selectedChat.partner_id && newItem.receiver_id === userId);
            if (!isRelevant) return;
          }

          queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
          queryClient.invalidateQueries({ queryKey: ['dm_list'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: table, filter: selectedChat.type === 'community' ? filter : undefined },
        () => {
           queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat, userId, queryClient]);
};

// --- COMPONENTS ---

// Memoized Message Bubble for performance
const MessageBubble = React.memo(({ 
  msg, 
  prevMsg, 
  isComm,
  canModerate,
  onDelete 
}: { 
  msg: Message;
  prevMsg: Message | null;
  isComm: boolean;
  canModerate: boolean;
  onDelete: (msgId: string) => void;
}) => {
  const isSequence = prevMsg && prevMsg.sender_id === msg.sender_id;
  const timeDiff = prevMsg ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() : 0;
  const showTimestamp = !prevMsg || timeDiff > 300000; // 5 minutes
  
  if (msg.is_deleted) {
    return (
      <div className="flex w-full mb-2 justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-xs italic py-2 px-4 bg-muted/30 rounded-full">
          <Trash2 className="w-3 h-3" />
          <span>Message deleted</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ${msg.pending ? 'opacity-70' : ''}`}>
      {showTimestamp && (
        <div className="flex justify-center my-4">
          <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
          </span>
        </div>
      )}
      
      <div className={`flex w-full mb-1.5 group ${msg.is_me ? 'justify-end' : 'justify-start'}`}>
        {!msg.is_me && isComm && (
          <div className="w-8 mr-2 flex-shrink-0 flex flex-col justify-end">
            {!isSequence ? (
              <Avatar className="w-8 h-8 ring-2 ring-background">
                <AvatarImage src={msg.sender_avatar} />
                <AvatarFallback className="text-xs">{msg.sender_name?.[0] || '?'}</AvatarFallback>
              </Avatar>
            ) : <div className="w-8" />}
          </div>
        )}

        <div className={`flex flex-col max-w-[75%] ${msg.is_me ? 'items-end' : 'items-start'}`}>
          {!msg.is_me && isComm && !isSequence && (
            <span className="text-[11px] ml-2 mb-1 text-muted-foreground font-semibold">
              {msg.sender_name || 'Unknown'}
            </span>
          )}

          <div className="relative group/message">
            <div 
              className={`
                relative overflow-hidden transition-all
                ${msg.is_me 
                  ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-md' 
                  : 'bg-white dark:bg-muted/80 border border-border/60 text-foreground shadow-sm'
                }
                ${msg.image_url ? 'p-1' : 'px-4 py-2.5'}
                ${msg.is_me ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tl-md'}
              `}
            >
              {msg.image_url && (
                <div className="relative group/image">
                  <img 
                    src={msg.image_url} 
                    alt="Attachment" 
                    className="max-w-full rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity" 
                    style={{ maxHeight: '300px', minWidth: '200px' }} 
                    loading="lazy"
                  />
                  {msg.content && (
                    <div className={`p-3 mt-1 ${msg.is_me ? 'text-primary-foreground' : ''}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  )}
                </div>
              )}

              {!msg.image_url && msg.content && (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
              )}
            </div>
            
            {/* Message Actions */}
            {!msg.pending && (
              <div className={`absolute top-1/2 -translate-y-1/2 ${msg.is_me ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover/message:opacity-100 transition-opacity`}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-full bg-background/95 backdrop-blur-sm border shadow-sm hover:bg-accent"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={msg.is_me ? "end" : "start"} className="w-48">
                    {msg.is_me && (
                      <DropdownMenuItem onClick={() => onDelete(msg.id)} className="text-red-600 focus:text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Message
                      </DropdownMenuItem>
                    )}
                    {!msg.is_me && canModerate && (
                      <DropdownMenuItem onClick={() => onDelete(msg.id)} className="text-red-600 focus:text-red-600">
                        <Shield className="w-4 h-4 mr-2" />
                        Remove Message
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1 mt-1 px-2">
             <span className="text-[10px] text-muted-foreground opacity-60">
              {msg.pending ? 'Sending...' : formatMessageTime(msg.created_at)}
            </span>
          </div>
         
        </div>
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

// --- COMMUNITY INFO DIALOG ---
const CommunityInfoDialog = ({ 
  isOpen, 
  onClose, 
  community 
}: { 
  isOpen: boolean;
  onClose: () => void;
  community: SelectedChat | null;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ['comm_members', community?.id],
    queryFn: async () => {
      if (!community || community.type !== 'community') return [];
      const { data, error } = await supabase
        .from('community_members')
        .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
        .eq('community_id', community.id)
        .order('role', { ascending: true });
      if (error) throw error;
      return data as unknown as CommunityMember[];
    },
    enabled: isOpen && !!community
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'moderator' | 'member' }) => {
      if (!community || community.type !== 'community') return;
      await supabase
        .from('community_members')
        .update({ role: newRole })
        .match({ community_id: community.id, user_id: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_members'] });
      toast.success("Role updated successfully");
    }
  });

  const kickMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!community || community.type !== 'community') return;
      await supabase
        .from('community_members')
        .delete()
        .match({ community_id: community.id, user_id: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_members'] });
      toast.success("Member removed from community");
    }
  });

  if (!community || community.type !== 'community') return null;

  const canModerate = community.my_role === 'admin' || community.my_role === 'moderator';
  const adminCount = members.filter(m => m.role === 'admin').length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col p-0">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 backdrop-blur-3xl" />
          <div className="relative p-6 pb-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 rounded-2xl ring-4 ring-background shadow-lg">
                <AvatarImage src={community.avatar} />
                <AvatarFallback className="text-2xl rounded-2xl">{community.name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-1">{community.name}</h2>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {community.member_count} members
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Crown className="w-4 h-4" />
                    {adminCount} admin{adminCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {community.description && (
          <div className="px-6 py-4 border-b bg-muted/30">
            <p className="text-sm text-muted-foreground leading-relaxed">{community.description}</p>
          </div>
        )}

        <div className="flex-1 overflow-hidden px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Members
            </h3>
            <Badge variant="secondary" className="text-xs">
              {members.length} total
            </Badge>
          </div>
          
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {members.map((m) => {
                const isMe = m.user_id === user?.id;
                const canManage = canModerate && !isMe && m.role !== 'admin';

                return (
                  <div 
                    key={m.user_id} 
                    className="flex items-center justify-between p-3 bg-muted/20 rounded-xl hover:bg-muted/40 transition-all group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-11 w-11 ring-2 ring-background">
                        <AvatarImage src={m.profile?.avatar_url} />
                        <AvatarFallback>{m.profile?.display_name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {m.profile?.display_name || 'Unknown User'}
                          </span>
                          {isMe && <Badge variant="outline" className="text-[10px] px-1.5 py-0">You</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {m.role === 'admin' && <Badge className="text-[10px] bg-amber-500">Admin</Badge>}
                          {m.role === 'moderator' && <Badge className="text-[10px] bg-blue-500">Moderator</Badge>}
                          {m.role === 'member' && <Badge variant="outline" className="text-[10px]">Member</Badge>}
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Manage Member</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {community.my_role === 'admin' && m.role !== 'moderator' && (
                            <DropdownMenuItem onClick={() => promoteMutation.mutate({ userId: m.user_id, newRole: 'moderator' })}>
                              <Shield className="w-4 h-4 mr-2" /> Promote to Moderator
                            </DropdownMenuItem>
                          )}
                          {community.my_role === 'admin' && m.role === 'moderator' && (
                            <DropdownMenuItem onClick={() => promoteMutation.mutate({ userId: m.user_id, newRole: 'member' })}>
                              <Users className="w-4 h-4 mr-2" /> Demote to Member
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => kickMutation.mutate(m.user_id)}>
                            <Ban className="w-4 h-4 mr-2" /> Remove from Community
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        <div className="p-6 pt-4 border-t">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- COMMUNITY SETTINGS DIALOG ---
const CommunitySettingsDialog = ({ 
  isOpen, 
  onClose, 
  communityId, 
  currentName, 
  currentDesc 
}: { 
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentName: string;
  currentDesc: string;
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [desc, setDesc] = useState(currentDesc);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    setName(currentName);
    setDesc(currentDesc);
  }, [currentName, currentDesc, isOpen]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Community name is required');
      await supabase
        .from('communities')
        .update({ name: name.trim(), description: desc.trim() })
        .eq('id', communityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community updated");
      onClose();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Deletes cascade usually, but manual cleanup ensures consistency
      await supabase.from('communities').delete().eq('id', communityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community deleted");
      setShowDeleteDialog(false);
      onClose();
    },
    onError: () => toast.error("Failed to delete community")
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Community Settings</DialogTitle>
            <DialogDescription>Manage your community's information</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Community Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={200} />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="destructive" className="w-full sm:w-auto" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !name.trim()} className="flex-1 sm:flex-none">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Community?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// --- MAIN COMPONENT ---
export default function Messages() {
  const { user } = useAuth() || {};
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [activeTab, setActiveTab] = useState<ChatMode>('dm');
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [friendSearch, setFriendSearch] = useState('');

  // Enable Real-time subscriptions
  useChatRealtime(selectedChat, user?.id);

  // --- QUERIES ---
  const { data: dmList = [], isLoading: loadingDMs } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      const map = new Map();
      data.forEach((msg: any) => {
        const rawPartner = msg.sender_id === user.id ? msg.receiver : msg.sender;
        const partner = Array.isArray(rawPartner) ? rawPartner[0] : rawPartner;

        if (partner && partner.user_id && !map.has(partner.user_id)) {
          map.set(partner.user_id, {
            type: 'dm',
            id: partner.user_id,
            partner_id: partner.user_id,
            name: partner.display_name || 'Unknown User',
            avatar: partner.avatar_url,
            last_msg: msg.content || (msg.image_url ? '📷 Photo' : ''),
            time: msg.created_at,
            is_online: false // Presence to be implemented
          });
        }
      });
      return Array.from(map.values());
    },
    enabled: !!user?.id,
  });

  const { data: commList = [], isLoading: loadingComms } = useQuery({
    queryKey: ['comm_list', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('communities')
        .select(`*, members:community_members(user_id, role)`);

      return data?.map((c: any) => {
        const myMembership = c.members?.find((m: any) => m.user_id === user?.id);
        return {
          type: 'community',
          id: c.id,
          name: c.name || 'Unnamed Community',
          description: c.description,
          avatar: c.avatar_url,
          member_count: c.member_count || 0,
          my_role: myMembership ? myMembership.role : 'none',
          is_joined: !!myMembership
        };
      }) || [];
    },
    enabled: !!user?.id,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['my_friends', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');
        
      return data?.map((f: any) => {
        const rawProfile = f.requester_id === user.id ? f.addressee : f.requester;
        const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
        if (!profile) return null;
        return { id: profile.user_id, name: profile.display_name, avatar: profile.avatar_url };
      }).filter(Boolean) || [];
    },
    enabled: !!user?.id && isNewChatOpen,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedChat?.type, selectedChat?.id, user?.id],
    queryFn: async () => {
      if (!user?.id || !selectedChat) return [];
      
      const isDM = selectedChat.type === 'dm';
      let query;
      
      if (isDM) {
        query = supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
      } else {
        query = supabase
          .from('community_messages')
          .select('*, sender:profiles!sender_id(display_name, avatar_url)')
          .eq('community_id', selectedChat.id)
          .order('created_at', { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((m: any) => ({ 
        ...m, 
        is_me: m.sender_id === user.id,
        sender_name: isDM ? selectedChat.name : m.sender?.display_name,
        sender_avatar: isDM ? selectedChat.avatar : m.sender?.avatar_url,
        is_deleted: m.is_deleted || false
      })) as Message[];
    },
    enabled: !!selectedChat && !!user?.id,
    refetchOnWindowFocus: false, // Prevent jarring refetches
  });

  // Attach auto-scroller
  const scrollRef = useScrollToBottom(messages);

  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return friends;
    return friends.filter((f: any) => f.name.toLowerCase().includes(friendSearch.toLowerCase()));
  }, [friends, friendSearch]);

  // --- MUTATIONS ---
  const joinCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id, role: 'member' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Joined community!");
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const createCommunity = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!newCommName.trim()) throw new Error("Community name is required");
      
      const { data: comm, error } = await supabase
        .from('communities')
        .insert({ name: newCommName.trim(), description: newCommDesc.trim(), creator_id: user.id, member_count: 1 })
        .select().single();
      
      if (error) throw error;
      await supabase.from('community_members').insert({ community_id: comm.id, user_id: user.id, role: 'admin' });
      return comm;
    },
    onSuccess: () => {
      setIsCreateCommunityOpen(false);
      setNewCommName('');
      setNewCommDesc('');
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community created!");
    },
    onError: (e: any) => toast.error(e.message)
  });

  const sendMessage = useMutation({
    mutationFn: async (vars: { content: string; file: File | null }) => {
      if ((!vars.content && !vars.file) || !selectedChat || !user) return;
      
      let imageUrl = null;
      if (vars.file) {
        const fileExt = vars.file.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, vars.file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        imageUrl = publicUrl;
      }

      const payload = { 
        sender_id: user.id, 
        content: vars.content || null, 
        image_url: imageUrl 
      };
      
      if (selectedChat.type === 'dm') {
        const { error } = await supabase.from('messages').insert({ ...payload, receiver_id: selectedChat.partner_id });
        if(error) throw error;
      } else {
        const { error } = await supabase.from('community_messages').insert({ ...payload, community_id: selectedChat.id });
        if(error) throw error;
      }
    },
    onMutate: async (vars) => {
      if (!selectedChat || !user) return;
      
      await queryClient.cancelQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
      const previousMessages = queryClient.getQueryData(['messages', selectedChat.type, selectedChat.id]);

      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        content: vars.content,
        image_url: vars.file ? URL.createObjectURL(vars.file) : undefined,
        created_at: new Date().toISOString(),
        sender_id: user.id,
        is_me: true,
        pending: true
      };

      queryClient.setQueryData(['messages', selectedChat.type, selectedChat.id], (old: Message[] | undefined) => {
        return old ? [...old, optimisticMessage] : [optimisticMessage];
      });

      // Clear input immediately for UX
      setMessageInput('');
      setImageFile(null);
      setImagePreview(null);
      
      return { previousMessages };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', selectedChat.type, selectedChat.id], context.previousMessages);
      }
      toast.error("Failed to send message");
    },
    onSettled: () => {
       queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.type, selectedChat.id] });
    }
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!selectedChat) return;
      const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
      await supabase
        .from(table)
        .update({ is_deleted: true, content: null, image_url: null })
        .eq('id', messageId);
    },
    onSuccess: () => {
      toast.success("Message deleted");
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: () => toast.error("Failed to delete message")
  });

  // --- HANDLERS ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) return toast.error("File too large (max 5MB)");
      if (!file.type.startsWith('image/')) return toast.error("Please select an image file");
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((messageInput.trim() || imageFile) && !sendMessage.isPending) {
        sendMessage.mutate({ content: messageInput.trim(), file: imageFile });
      }
    }
  };

  // Cleanup object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  if (!user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  // --- RENDER: CHAT VIEW ---
  if (selectedChat) {
    const isComm = selectedChat.type === 'community';
    const canType = !isComm || (isComm && selectedChat.my_role !== 'none');
    const canModerate = isComm && (selectedChat.my_role === 'admin' || selectedChat.my_role === 'moderator');

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col min-h-60">
        <div className="px-4 py-3 border-b flex items-center gap-3 bg-gradient-to-r from-background to-muted/20 backdrop-blur-xl shadow-sm shrink-0 z-10">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full hover:bg-muted" onClick={() => setSelectedChat(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <Avatar className="h-11 w-11 border-2 border-background ring-2 ring-primary/10 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <AvatarImage src={selectedChat.avatar} />
            <AvatarFallback>{selectedChat.name?.[0] || 'C'}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <h3 className="font-bold text-base truncate">{selectedChat.name}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {isComm ? (
                <>
                  <Users className="w-3 h-3" /> {selectedChat.member_count} members
                  {selectedChat.my_role === 'admin' && <Badge variant="secondary" className="ml-1 text-[10px] bg-amber-100 text-amber-700">Admin</Badge>}
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Active now
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-0.5">
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9"><MoreVertical className="h-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setIsInfoOpen(true)}>
                  <Info className="w-4 h-4 mr-2" /> {isComm ? 'Community Info' : 'View Profile'}
                </DropdownMenuItem>
                {isComm && selectedChat.my_role === 'admin' && (
                  <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                    <Settings className="w-4 h-4 mr-2" /> Settings
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isComm && (
          <>
            <CommunityInfoDialog isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} community={selectedChat} />
            {selectedChat.my_role === 'admin' && (
              <CommunitySettingsDialog 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                communityId={selectedChat.id} 
                currentName={selectedChat.name} 
                currentDesc={selectedChat.description || ''} 
              />
            )}
          </>
        )}

        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-muted/5 to-muted/10 p-4 scroll-smooth" ref={scrollRef}>
          <div className="flex flex-col justify-end min-h-[60px] pb-2">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-60 py-16">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-pulse">
                  <MessageSquare className="w-10 h-10 text-primary" />
                </div>
                <h3 className="font-bold text-xl mb-2">No messages yet</h3>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  {isComm ? "Start the conversation in this community" : "Send a message to start chatting"}
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble 
                  key={m.id} 
                  msg={m} 
                  prevMsg={i > 0 ? messages[i-1] : null} 
                  isComm={isComm}
                  canModerate={canModerate}
                  onDelete={(msgId) => deleteMessage.mutate(msgId)}
                />
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-background/95 backdrop-blur-xl shrink-0">
          {canType ? (
            <div className="flex flex-col gap-3">
              {imagePreview && (
                <div className="relative w-32 h-32 bg-muted rounded-2xl overflow-hidden border-2 border-primary/30 shadow-md group">
                  <img src={imagePreview} className="w-full h-full object-cover" alt="preview" />
                  <button 
                    onClick={() => { setImageFile(null); setImagePreview(null); }} 
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                <Button variant="ghost" size="icon" className="rounded-full shrink-0 h-11 w-11" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon className="w-5 h-5" />
                </Button>
                
                <div className="flex-1 relative">
                  <Textarea 
                    value={messageInput} 
                    onChange={(e) => setMessageInput(e.target.value)} 
                    placeholder="Type a message..." 
                    className="min-h-[48px] max-h-32 py-3.5 pr-12 resize-none rounded-3xl bg-muted/60 border-border/50 focus:border-primary focus:bg-background transition-all"
                    onKeyDown={handleKeyPress}
                    rows={1}
                  />
                </div>

                <Button 
                  size="icon" 
                  onClick={() => sendMessage.mutate({ content: messageInput.trim(), file: imageFile })} 
                  disabled={sendMessage.isPending || (!messageInput.trim() && !imageFile)}
                  className="rounded-full h-12 w-12 shadow-lg shrink-0"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button 
              className="w-full rounded-2xl shadow-md h-12" 
              onClick={() => joinCommunity.mutate(selectedChat.id)}
              disabled={joinCommunity.isPending}
            >
              {joinCommunity.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
              Join Community to Chat
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER: LIST VIEW ---
  return (
    <div className="min-h-screen flex flex-col pb-20 bg-gradient-to-b from-background to-muted/10">
      <div className="container-mobile py-4 space-y-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Messages</h1>
          <Button size="icon" className="rounded-full shadow-lg h-12 w-12" onClick={() => activeTab === 'dm' ? setIsNewChatOpen(true) : setIsCreateCommunityOpen(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search conversations..." 
            className="pl-11 bg-muted/30 border-transparent rounded-2xl h-10 focus:bg-background transition-all" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/40 p-1.5 rounded-2xl mb-5">
            <TabsTrigger value="dm" className="rounded-xl py-2.5 transition-all font-semibold">
              <MessageSquare className="w-4 h-4 mr-2" /> Direct Messages
            </TabsTrigger>
            <TabsTrigger value="community" className="rounded-xl py-2.5 transition-all font-semibold">
              <Users className="w-4 h-4 mr-2" /> Communities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dm" className="space-y-2 animate-in fade-in-50 mt-0">
            {loadingDMs ? (
              <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" /> Loading...</div>
            ) : dmList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="w-10 h-10 text-primary mb-5 opacity-20" />
                <h3 className="font-bold text-xl mb-2">No messages yet</h3>
                <Button onClick={() => setIsNewChatOpen(true)} className="rounded-full mt-4">New Message</Button>
              </div>
            ) : (
              dmList.filter((c: any) => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((chat: any) => (
                <div key={chat.id} onClick={() => setSelectedChat(chat)} className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-2xl cursor-pointer transition-all bg-gradient-to-r from-background to-muted/5">
                  <div className="relative">
                    <Avatar className="h-14 w-14 border-2 border-background shadow-md">
                      <AvatarImage src={chat.avatar} />
                      <AvatarFallback>{chat.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-[15px] truncate">{chat.name}</h3>
                      <span className="text-[11px] text-muted-foreground font-medium">{formatTime(chat.time)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate font-medium">{chat.last_msg}</p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="community" className="space-y-2 animate-in fade-in-50 mt-0">
            {loadingComms ? (
              <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" /> Loading...</div>
            ) : commList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                 <Users className="w-10 h-10 text-blue-600 mb-5 opacity-20" />
                 <h3 className="font-bold text-xl mb-2">No communities yet</h3>
                 <Button onClick={() => setIsCreateCommunityOpen(true)} className="rounded-full mt-4">Create Community</Button>
              </div>
            ) : (
              commList.filter((c: any) => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((comm: any) => (
                <div key={comm.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-2xl transition-all bg-gradient-to-r from-background to-muted/5">
                  <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md cursor-pointer" onClick={() => setSelectedChat(comm)}>
                    <AvatarImage src={comm.avatar} />
                    <AvatarFallback>{comm.name?.[0] || 'C'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedChat(comm)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-[15px] truncate">{comm.name}</h3>
                      {comm.my_role === 'admin' && <Badge className="text-[10px] bg-amber-100 text-amber-700">Admin</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-3 h-3"/> {comm.member_count} member{comm.member_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant={comm.my_role !== 'none' ? "outline" : "default"} 
                    className="rounded-full px-5"
                    onClick={comm.my_role !== 'none' ? () => setSelectedChat(comm) : () => joinCommunity.mutate(comm.id)}
                  >
                    {comm.my_role !== 'none' ? "Open" : "Join"}
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Start a conversation with your friends</DialogDescription>
          </DialogHeader>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search friends..." className="pl-10 bg-muted/50 rounded-xl" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} />
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-2 p-1">
              {filteredFriends.map((f: any) => (
                <div key={f.id} onClick={() => { setSelectedChat({ type: 'dm', id: f.id, partner_id: f.id, name: f.name, avatar: f.avatar }); setIsNewChatOpen(false); }} className="flex items-center gap-3 p-3 hover:bg-muted/60 rounded-xl cursor-pointer transition-all">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={f.avatar} />
                    <AvatarFallback>{f.name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-[15px] flex-1">{f.name}</span>
                  <MessageSquare className="w-5 h-5 text-primary opacity-50" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateCommunityOpen} onOpenChange={setIsCreateCommunityOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Community Name" value={newCommName} onChange={(e) => setNewCommName(e.target.value)} maxLength={50} />
            <Textarea placeholder="Description" value={newCommDesc} onChange={(e) => setNewCommDesc(e.target.value)} rows={4} maxLength={200} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCommunityOpen(false)}>Cancel</Button>
            <Button onClick={() => createCommunity.mutate()} disabled={!newCommName.trim() || createCommunity.isPending}>
              {createCommunity.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}