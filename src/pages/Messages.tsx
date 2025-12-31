import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { 
  Search, Send, ArrowLeft, Plus, Settings, Users, 
  MessageSquare, X, Loader2, 
  MoreVertical, Info, Image as ImageIcon, Grid, Pin, ChevronDown, ChevronUp, Upload
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
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { useFriends } from "@/hooks/useFriends";

// Import refactored components and hooks
import { ChatMode, SelectedChat, Message, DMListItem, CommunityListItem } from '@/types/messages';
import { validateImage, formatTime } from '@/utils/messageHelpers';
import { useScrollToBottom } from '@/hooks/useScrollToBottom';
import { useChatRealtime } from '@/hooks/useChatRealtime';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { MediaGallery } from '@/components/messages/MediaGallery';
import { CommunityInfoDialog } from '@/components/messages/CommunityInfoDialog';
import { CommunitySettingsDialog } from '@/components/messages/CommunitySettingsDialog';

// Helper function to extract display name from profile
const getDisplayName = (profile: any): string => {
  if (!profile) return 'Unknown User';
  
  // Priority order: display_name > username > full_name > email
  if (profile.display_name?.trim()) return profile.display_name.trim();
  if (profile.username?.trim()) return profile.username.trim();
  if (profile.email) return profile.email.split('@')[0];
  
  return 'Unknown User';
};

export default function Messages() {
  const { user } = useAuth() || {};
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null); 

  // UI state
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
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Create community state
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');
  const [newCommCoverFile, setNewCommCoverFile] = useState<File | null>(null);
  const [newCommCoverPreview, setNewCommCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  
  // Pinned messages state
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);

  const [friendSearch, setFriendSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  // Profile for typing identity
  const { data: userProfile } = useQuery({
  queryKey: ['my_profile', user?.id],
  queryFn: async () => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, display_name, username, email, avatar_url')  // Added full_name
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
    return data;
  },
  enabled: !!user?.id
});

  const currentUser = useMemo(() => ({
    id: user?.id,
    email: user?.email,
    user_metadata: { full_name: userProfile?.display_name || userProfile?.username }
  }), [user, userProfile]);

  // Typing indicator hook
  const { typingUsers, handleTypingUpdate, clearTyping } = useTypingIndicator();

  // Realtime hook
  const { broadcastTyping, broadcastStopTyping } = useChatRealtime(
    selectedChat, 
    currentUser, 
    handleTypingUpdate,
    () => { /* On new message received */ }
  );

  // Clear typing when chat changes
  useEffect(() => {
    clearTyping();
  }, [selectedChat?.id, clearTyping]);

  // Debounce search query
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  // FIXED DM LIST QUERY - Properly fetch and display user names
  const { data: dmList = [], isLoading: loadingDMs } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async (): Promise<DMListItem[]> => {
      if (!user?.id) return [];

      console.log("🔍 Fetching DM list for user:", user.id);

      // Step 1: Get all messages involving this user
      const { data: rawMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (msgError) {
        console.error("❌ Error fetching messages:", msgError);
        return [];
      }

      console.log("📧 Raw messages fetched:", rawMessages?.length);

      // Step 2: Build partner map with latest message details
      const partnerMap = new Map<string, { last_msg: string; time: string }>();
      const partnerIds = new Set<string>();

      rawMessages?.forEach((msg: any) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        
        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            last_msg: msg.content ?? (msg.image_url ? '📷 Photo' : 'Message'),
            time: msg.created_at
          });
          partnerIds.add(partnerId);
        }
      });

      const idsList = Array.from(partnerIds);
      console.log("👥 Unique partner IDs:", idsList.length);

      if (idsList.length === 0) return [];

      // Step 3: Fetch ALL profiles for partners with comprehensive field selection
      const { data: profiles, error: profileError } = await supabase
  .from('profiles')
  .select('id, user_id, display_name, username, email, avatar_url')
  .in('user_id', idsList);

      if (profileError) {
        console.error("❌ Profile fetch error:", profileError);
      }

      console.log("👤 Profiles fetched:", profiles?.length, "/ Expected:", idsList.length);

      // Step 4: Create profile lookup map
      const profileLookup = new Map<string, any>();
profiles?.forEach((p: any) => {
  // Map by user_id (primary key for lookups)
  if (p.user_id) {
    profileLookup.set(p.user_id, p);
  }
  // Also map by id if different
  if (p.id && p.id !== p.user_id) {
    profileLookup.set(p.id, p);
  }
});

      // Step 5: Fetch unread counts
      const { data: unreadData } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('is_read', false);

      const unreadCounts = new Map<string, number>();
      unreadData?.forEach((m: any) => {
        unreadCounts.set(m.sender_id, (unreadCounts.get(m.sender_id) || 0) + 1);
      });

      // Step 6: Map to DMListItem with proper name resolution
      return idsList.map(pid => {
        const details = partnerMap.get(pid)!;
        const profile = profileLookup.get(pid);

        if (!profile) {
          console.warn(`⚠️ No profile found for partner ID: ${pid}`);
        }

        const displayName = getDisplayName(profile);

        console.log(`✅ DM mapped: ${displayName} (${pid})`);

        return {
          type: 'dm' as const,
          id: pid,
          partner_id: pid,
          name: displayName,
          avatar: profile?.avatar_url,
          last_msg: details.last_msg,
          time: details.time,
          is_online: false,
          unread_count: unreadCounts.get(pid) || 0
        };
      }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    },
    enabled: !!user?.id,
    staleTime: 30000,
    refetchInterval: 60000 // Refetch every minute to keep names updated
  });

  // FIXED COMMUNITIES QUERY - Properly fetch all community data
  const { data: commList = [], isLoading: loadingComms } = useQuery({
    queryKey: ['comm_list', user?.id],
    queryFn: async (): Promise<CommunityListItem[]> => {
      if (!user?.id) return [];
      
      try {
        console.log("🏘️ Fetching communities for user:", user.id);

        // Fetch ALL communities with complete field selection
        const { data: communities, error: commError } = await supabase
          .from('communities')
          .select('id, name, description, cover_url, member_count, creator_id, created_at')
          .order('created_at', { ascending: false });

        if (commError) {
          console.error("❌ Communities fetch error:", commError);
          throw commError;
        }
        
        console.log("🏘️ Communities fetched:", communities?.length);

        if (!communities || communities.length === 0) {
          console.log("ℹ️ No communities found");
          return [];
        }

        // Fetch user's memberships
        const { data: memberships, error: memError } = await supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', user.id);

        if (memError) {
          console.error("❌ Memberships fetch error:", memError);
        }

        console.log("👥 User memberships:", memberships?.length);

        const membershipMap = new Map<string, string>();
        memberships?.forEach((m: any) => {
          membershipMap.set(m.community_id, m.role);
        });

        // Map communities with proper data validation
        return communities.map((c: any) => {
  const myRole = membershipMap.get(c.id);
  
  const communityName = c.name?.trim() || 'Unnamed Community';
  
  console.log(`✅ Community: "${communityName}" - Role: ${myRole || 'none'} - Cover: ${c.cover_url ? 'Yes' : 'No'}`);

  return {
    type: 'community' as const,
    id: c.id,
    name: communityName,
    description: c.description?.trim() || '',
    cover: c.cover_url || undefined,
    cover_url: c.cover_url || undefined,  // Add this field
    avatar: c.cover_url || undefined,      // Add this field for consistency
    member_count: c.member_count || 0,
    my_role: (myRole || 'none') as 'admin' | 'moderator' | 'member' | 'none',
    is_joined: !!myRole,
  };
});
      } catch (e) {
        console.error("💥 Community fetch error:", e);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
    refetchInterval: 60000
  });

  // FIXED FRIENDS HOOK - Robust name resolution
  const { friends: rawFriends = [] } = useFriends(user?.id);

// Debug: Log raw friends structure
useEffect(() => {
  if (rawFriends && rawFriends.length > 0) {
    console.log("🔍 Raw friends structure:", JSON.stringify(rawFriends[0], null, 2));
  }
}, [rawFriends]);

const friends = useMemo(() => {
  if (!rawFriends || !user?.id) {
    console.log("❌ No friends data available");
    return [];
  }
  
  console.log("👫 Processing", rawFriends.length, "friend relationships");
  
  const processed = rawFriends
    .map((friendship: any, index: number) => {
      console.log(`\n--- Processing friendship ${index + 1} ---`);
      console.log("Friendship data:", friendship);
      
      let profile = null;
      let friendId = null;

      // Case 1: Current user is requester (they sent the request)
      if (friendship.requester_id === user.id) {
        console.log("→ User is requester, friend is addressee");
        profile = Array.isArray(friendship.addressee) 
          ? friendship.addressee[0] 
          : friendship.addressee;
        friendId = friendship.addressee_id;
      } 
      // Case 2: Current user is addressee (they received the request)
      else if (friendship.addressee_id === user.id) {
        console.log("→ User is addressee, friend is requester");
        profile = Array.isArray(friendship.requester) 
          ? friendship.requester[0] 
          : friendship.requester;
        friendId = friendship.requester_id;
      }
      // Case 3: Fallback - shouldn't happen but handle gracefully
      else {
        console.warn("⚠️ User ID doesn't match requester or addressee!");
        return null;
      }

      // Validate we have the data we need
      if (!profile) {
        console.error("❌ Profile is null/undefined");
        console.error("Friendship object:", friendship);
        return null;
      }

      if (!friendId) {
        console.error("❌ Friend ID could not be determined");
        return null;
      }

      const displayName = getDisplayName(profile);
      console.log(`✅ Resolved: ${displayName} (ID: ${friendId})`);
      
      return {
        id: friendId,
        name: displayName,
        avatar: profile.avatar_url || null,
        is_online: profile.is_online || false,
        last_seen: profile.last_seen || null
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  console.log(`\n✅ Successfully processed ${processed.length} out of ${rawFriends.length} friends\n`);
  return processed;
}, [rawFriends, user?.id]);
  // FIXED: Messages query with proper sender name resolution
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedChat?.type, selectedChat?.id, user?.id],
    queryFn: async (): Promise<Message[]> => {
      if (!user?.id || !selectedChat) return [];
      
      if (selectedChat.type === 'dm') {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        return (data || []).map((m: any) => ({
          ...m,
          is_me: m.sender_id === user.id,
          sender_name: m.sender_id === user.id ? 'You' : selectedChat.name,
          sender_avatar: m.sender_id === user.id ? userProfile?.avatar_url : selectedChat.avatar,
          is_deleted: m.is_deleted || false,
          read: m.is_read
        }));
      } else {
        // Community messages - fetch with full sender profile
        const { data, error } = await supabase
          .from('community_messages')
          .select(`
            *,
            sender:profiles!sender_id(id, user_id, display_name, username, email, avatar_url)
          `)
          .eq('community_id', selectedChat.id)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        return (data || []).map((m: any) => {
          const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
          const senderName = m.sender_id === user.id ? 'You' : getDisplayName(sender);
          
          return {
            ...m,
            is_me: m.sender_id === user.id,
            sender_name: senderName,
            sender_avatar: sender?.avatar_url,
            is_deleted: m.is_deleted || false
          };
        });
      }
    },
    enabled: !!selectedChat && !!user?.id,
    refetchOnWindowFocus: false
  });

  // Scroll hook
  const { scrollRef, scrollToBottom } = useScrollToBottom(messages);

  // Mark as read
  useEffect(() => {
    if (selectedChat?.type === 'dm' && messages.length > 0 && user?.id) {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg.is_me && !lastMsg.read) {
        supabase.from('messages')
          .update({ is_read: true })
          .eq('sender_id', selectedChat.partner_id)
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .then(({ error }) => {
            if (!error) {
              queryClient.invalidateQueries({ queryKey: ['dm_list'] });
              queryClient.invalidateQueries({ queryKey: ['messages'] });
            }
          });
      }
    }
  }, [messages, selectedChat, user?.id, queryClient]);

  // Scroll to message
  const scrollToId = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2000);
    }
  }, []);

  // Filtered friends for new chat
  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return friends;
    const q = friendSearch.toLowerCase();
    return friends.filter((f: any) => f?.name?.toLowerCase().includes(q));
  }, [friends, friendSearch]);

  const { onlineFriends, offlineFriends } = useMemo(() => {
    const online = filteredFriends.filter((f: any) => f.is_online);
    const offline = filteredFriends.filter((f: any) => !f.is_online);
    return { onlineFriends: online, offlineFriends: offline };
  }, [filteredFriends]);

  // Mutations
  const joinCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: user.id, role: 'member' });
      if (error) throw error;
      
      // Update member count
      await supabase.rpc('increment_community_members', { community_id: communityId });
    },
    onSuccess: () => {
      toast.success("Joined community!");
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to join community")
  });

const createCommunity = useMutation({
  mutationFn: async () => {
    if (!user) throw new Error("Not authenticated");
    if (!newCommName.trim()) throw new Error("Community name is required");

    let coverUrl: string | null = null;
    if (newCommCoverFile) {
      const fileExt = newCommCoverFile.name.split('.').pop();
      const filePath = `community-covers/${user.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, newCommCoverFile, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        console.error("Cover upload error:", uploadError);
        throw new Error("Failed to upload cover image");
      }
      
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);
      
      coverUrl = urlData.publicUrl;
      console.log("✅ Cover uploaded successfully:", coverUrl);
    }

      const { data: comm, error } = await supabase
      .from('communities')
      .insert({ 
        name: newCommName.trim(), 
        description: newCommDesc.trim(), 
        creator_id: user.id, 
        member_count: 1,
        cover_url: coverUrl
      })
      .select()
      .single();
    
    if (error) {
      console.error("Community creation error:", error);
      throw error;
    }

      await supabase.from('community_members').insert({ 
      community_id: comm.id, 
      user_id: user.id, 
      role: 'admin' 
    });
    
    return comm;
  },
  onSuccess: (comm) => {
    console.log("✅ Community created:", comm);
    setIsCreateCommunityOpen(false);
    setNewCommName('');
    setNewCommDesc('');
    setNewCommCoverFile(null);
    if (newCommCoverPreview?.startsWith('blob:')) {
      try { URL.revokeObjectURL(newCommCoverPreview); } catch {}
    }
    setNewCommCoverPreview(null);
    queryClient.invalidateQueries({ queryKey: ['comm_list'] });
    toast.success("Community created successfully!");
  },
  onError: (e: any) => {
    console.error("❌ Create community error:", e);
    toast.error(e?.message ?? "Failed to create community");
  }
});

  const pinMessage = useMutation({
    mutationFn: async ({ messageId, isPinned }: { messageId: string; isPinned: boolean }) => {
      if (!selectedChat || selectedChat.type !== 'community') {
        throw new Error("Can only pin messages in communities");
      }
      
      const { error } = await supabase
        .from('community_messages')
        .update({ is_pinned: !isPinned })
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.isPinned ? "Message unpinned" : "Message pinned");
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChat?.type, selectedChat?.id] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update pin status");
    }
  });

const sendMessage = useMutation({
  mutationFn: async (vars: { content: string | null; file: File | null }) => {
    // Validation
    if ((!vars.content && !vars.file) || !selectedChat || !user) {
      throw new Error('Missing required data');
    }

    console.log('📤 Sending message:', {
      type: selectedChat.type,
      hasContent: !!vars.content,
      hasFile: !!vars.file
    });

    // 1. Upload file if exists
    let imageUrl: string | null = null;
    if (vars.file) {
      console.log('📁 Uploading file...');
      
      const fileExt = vars.file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, vars.file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);
      
      imageUrl = urlData.publicUrl;
      console.log('✅ File uploaded:', imageUrl);
    }

    // 2. Insert message based on type
    if (selectedChat.type === 'dm') {
      console.log('💬 Sending DM to:', selectedChat.partner_id);
      
      // ✅ FIX: Include all required fields for messages table
      const dmPayload = {
        sender_id: user.id,
        receiver_id: selectedChat.partner_id,
        content: vars.content || null,
        image_url: imageUrl,
        is_read: false,  // ✅ ADD THIS if column exists
        created_at: new Date().toISOString()  // ✅ Explicit timestamp
      };
      
      console.log('📦 DM Payload:', dmPayload);
      
      const { data, error } = await supabase
        .from('messages')
        .insert(dmPayload)
        .select()  // ✅ Return inserted data
        .single();
      
      if (error) {
        console.error('❌ DM Insert Error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`DM failed: ${error.message}`);
      }
      
      console.log('✅ DM sent:', data);
      return data;
      
    } else {
      console.log('🏛️ Sending community message to:', selectedChat.id);
      
      // ✅ FIX: Include all required fields for community_messages table
      const communityPayload = {
        sender_id: user.id,
        community_id: selectedChat.id,
        content: vars.content || null,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
        is_deleted: false,  // ✅ ADD THIS if column exists
        is_pinned: false    // ✅ ADD THIS if column exists
      };
      
      console.log('📦 Community Payload:', communityPayload);
      
      const { data, error } = await supabase
        .from('community_messages')
        .insert(communityPayload)
        .select()  // ✅ Return inserted data
        .single();
      
      if (error) {
        console.error('❌ Community Insert Error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Community message failed: ${error.message}`);
      }
      
      console.log('✅ Community message sent:', data);
      return data;
    }
  },
  
  onMutate: async (vars) => {
    if (!selectedChat || !user) return;
    
    console.log('🔄 Optimistic update...');
    
    // Cancel outgoing queries
    await queryClient.cancelQueries({ 
      queryKey: ['messages', selectedChat.type, selectedChat.id] 
    });
    
    // Snapshot previous value
    const previousMessages = queryClient.getQueryData<Message[]>([
      'messages', 
      selectedChat.type, 
      selectedChat.id
    ]);

    // Create optimistic message
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: vars.content ?? null,
      image_url: vars.file ? URL.createObjectURL(vars.file) : undefined,
      created_at: new Date().toISOString(),
      sender_id: user.id,
      is_me: true,
      pending: true,
      sender_name: 'You', 
      sender_avatar: undefined
    };
    
    // Optimistically update cache
    queryClient.setQueryData(
      ['messages', selectedChat.type, selectedChat.id], 
      (old: Message[] | undefined) => {
        return old ? [...old, optimisticMessage] : [optimisticMessage];
      }
    );

    // Clear input immediately
    setMessageInput('');
    if (imagePreview?.startsWith('blob:')) {
      try { URL.revokeObjectURL(imagePreview); } catch {}
    }
    setImageFile(null);
    setImagePreview(null);
    scrollToBottom();

    return { previousMessages };
  },
  
  onError: (err: any, _vars, context: any) => {
    console.error('❌ Send message error:', err);
    
    // Rollback optimistic update
    if (context?.previousMessages) {
      queryClient.setQueryData(
        ['messages', selectedChat?.type, selectedChat?.id], 
        context.previousMessages
      );
    }
    
    // Show specific error message
    const errorMessage = err.message || 'Failed to send message';
    toast.error(errorMessage);
    
    // Log for debugging
    console.error('Full error object:', err);
  },
  
  onSuccess: (data) => {
    console.log('✅ Message sent successfully:', data);
    toast.success('Message sent!');
  },
  
  onSettled: () => {
    console.log('🔄 Invalidating queries...');
    
    // Refetch messages
    queryClient.invalidateQueries({ 
      queryKey: ['messages', selectedChat?.type, selectedChat?.id] 
    });
    
    // Refetch DM list (updates "last message")
    queryClient.invalidateQueries({ 
      queryKey: ['dm_list'] 
    });
  }
});

  const editMessage = useMutation({
    mutationFn: async ({ msg, newContent }: { msg: Message, newContent: string }) => {
      if (!selectedChat) return;
      const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
      const { error } = await supabase.from(table).update({ content: newContent }).eq('id', msg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChat?.type, selectedChat?.id] });
      toast.success("Message updated");
    },
    onError: () => toast.error("Failed to update message")
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!selectedChat) return;
      const table = selectedChat.type === 'dm' ? 'messages' : 'community_messages';
      const { error } = await supabase.from(table).update({ is_deleted: true, content: null, image_url: null }).eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Message deleted");
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['dm_list'] });
    },
    onError: () => toast.error("Failed to delete message")
  });

  // Handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) return toast.error(error);
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);

  const handleCoverSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) return toast.error(error);
    
    setNewCommCoverFile(file);
    setNewCommCoverPreview(URL.createObjectURL(file));
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setMessageInput(value);
    
    if (value.trim().length > 0) {
      if (!typingTimeoutRef.current) {
        broadcastTyping();
      }
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        broadcastStopTyping();
        typingTimeoutRef.current = null;
      }, 3000);
    } else {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      broadcastStopTyping();
    }
  }, [broadcastTyping, broadcastStopTyping]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((messageInput.trim() || imageFile) && !sendMessage.isPending) {
        sendMessage.mutate({ content: messageInput.trim() || null, file: imageFile });
        setReplyingTo(null);
      }
    }
  }, [messageInput, imageFile, sendMessage]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) {
        try { URL.revokeObjectURL(imagePreview); } catch {}
      }
    };
  }, [imagePreview]);

  // Not authenticated
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

  // Chat view
  if (selectedChat) {
    const isComm = selectedChat.type === 'community';

    // With this:
    const { data: myMembership } = useQuery({
      queryKey: ['my_membership', selectedChat?.id, user?.id],
      queryFn: async () => {
        if (!user?.id || !selectedChat || selectedChat.type !== 'community') return null;
        const { data } = await supabase
          .from('community_members')
          .select('role, muted_until')
          .eq('community_id', selectedChat.id)
          .eq('user_id', user.id)
          .single();
        return data;
      },
      enabled: !!selectedChat && selectedChat.type === 'community' && !!user?.id
    });
    
    const isMuted = myMembership?.muted_until && new Date(myMembership.muted_until) > new Date();
    const canType = !isComm || (isComm && selectedChat.my_role !== 'none' && !isMuted);

    const canModerate = isComm && (selectedChat.my_role === 'admin' || selectedChat.my_role === 'moderator');
    const chatImages = messages.filter(m => m.image_url && !m.is_deleted).map(m => ({ url: m.image_url!, id: m.id }));
    const pinnedMessages = isComm ? messages.filter(m => m.is_pinned && !m.is_deleted) : [];

    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col h-[100dvh]">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-3 bg-gradient-to-r from-background to-muted/20 backdrop-blur-xl shadow-sm shrink-0 z-10">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full hover:bg-muted" onClick={() => setSelectedChat(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <Avatar className="h-11 w-11 border-2 border-background ring-2 ring-primary/10 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <AvatarImage src={selectedChat.avatar} />
            <AvatarFallback>{selectedChat.name?.[0]?.toUpperCase() ?? 'C'}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
            <h3 className="font-bold text-base truncate">{selectedChat.name}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {isComm ? (
                <>
                  <Users className="w-3 h-3" /> {selectedChat.member_count} members
                  {selectedChat.my_role === 'admin' && <Badge variant="secondary" className="ml-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Admin</Badge>}
                </>
              ) : (
                selectedChat.is_online ? (
                  <span className="flex items-center gap-1.5 text-green-600">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Active now
                  </span>
                ) : (
                  <span>Tap to view profile</span>
                )
              )}
            </p>
          </div>
          
          {/* Buttons Section - FIXED */}
          <div className="flex items-center gap-1">
            {chatImages.length > 0 && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full h-9 w-9" 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsGalleryOpen(true);
                }}
              >
                <Grid className="w-4 h-4" />
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full h-9 w-9"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsInfoOpen(true);
                  }}
                >
                  <Info className="w-4 h-4 mr-2" />
                  {isComm ? 'Community Info' : 'View Profile'}
                </DropdownMenuItem>
                {isComm && selectedChat.my_role === 'admin' && (
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSettingsOpen(true);
                    }}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Community Settings
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Dialogs */}
        <MediaGallery 
          isOpen={isGalleryOpen} 
          onClose={() => setIsGalleryOpen(false)} 
          images={chatImages} 
        />
        
        {/* DM Profile Dialog */}
        {!isComm && (
          <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Profile</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                <Avatar className="w-24 h-24 ring-4 ring-primary/10">
                  <AvatarImage src={selectedChat.avatar} />
                  <AvatarFallback className="text-2xl">{selectedChat.name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h2 className="text-xl font-bold mb-1">{selectedChat.name}</h2>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                    {selectedChat.is_online ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Active now
                      </>
                    ) : (
                      'Offline'
                    )}
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        
        {/* Community Dialogs */}
        {isComm && (
          <>
            <CommunityInfoDialog 
              isOpen={isInfoOpen} 
              onClose={() => setIsInfoOpen(false)} 
              community={selectedChat}
              coverUrl={selectedChat.cover || selectedChat.cover_url || selectedChat.avatar}
            />
            {selectedChat.my_role === 'admin' && (
              <CommunitySettingsDialog 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                communityId={selectedChat.id} 
                currentName={selectedChat.name} 
                currentDesc={selectedChat.description || ''} 
                currentCoverUrl={selectedChat.cover || selectedChat.cover_url || selectedChat.avatar}
              />
            )}
          </>
        )}

        {/* Pinned Messages Section */}
        {isComm && pinnedMessages.length > 0 && (
          <div className="border-b bg-gradient-to-r from-amber-50/50 to-amber-100/30 dark:from-amber-900/10 dark:to-amber-800/5">
            <button
              onClick={() => setShowPinnedMessages(!showPinnedMessages)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-amber-100/30 dark:hover:bg-amber-900/20 transition-colors"
            >
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Pin className="w-4 h-4" />
                <span className="text-sm font-medium">{pinnedMessages.length} Pinned Message{pinnedMessages.length > 1 ? 's' : ''}</span>
              </div>
              {showPinnedMessages ? (
                <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-500" />
              )}
            </button>
            {showPinnedMessages && (
              <div className="px-4 pb-3 space-y-2 max-h-[200px] overflow-y-auto">
                {pinnedMessages.map((m) => (
                  <div 
                    key={m.id}
                    onClick={() => scrollToId(m.id)}
                    className="flex items-start gap-3 p-3 bg-background/80 rounded-xl border border-amber-200/50 dark:border-amber-700/30 cursor-pointer hover:bg-background transition-colors"
                  >
                    <Pin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">{m.sender_name}</p>
                      <p className="text-sm text-foreground line-clamp-2">{m.content || '📷 Photo'}</p>
                    </div>
                    {canModerate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          pinMessage.mutate({ messageId: m.id, isPinned: true });
                        }}
                      >
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
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
              <>
                {messages.map((m, i) => (
                  <MessageBubble 
                    key={m.id} 
                    msg={m} 
                    prevMsg={i > 0 ? messages[i-1] : null} 
                    isComm={isComm}
                    canModerate={canModerate}
                    onDelete={(msgId) => deleteMessage.mutate(msgId)}
                    onReply={(msg) => setReplyingTo(msg)}
                    onEdit={(msg, content) => editMessage.mutateAsync({ msg, newContent: content })}
                    onPin={canModerate ? (msg) => pinMessage.mutate({ messageId: msg.id, isPinned: !!msg.is_pinned }) : undefined}
                    onImageLoad={() => scrollToBottom(true)}
                    scrollToId={scrollToId}
                  />
                ))}
                {typingUsers.length > 0 && (
                  <TypingIndicator typingUsers={typingUsers} showAvatars={isComm} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur-xl shrink-0">
          {canType ? (
            <div className="flex flex-col gap-3">
              {replyingTo && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border-l-4 border-primary">
                  <div className="flex-1 min-w-0" onClick={() => scrollToId(replyingTo.id)}>
                    <p className="text-xs font-semibold text-primary mb-1 cursor-pointer hover:underline">
                      Replying to {replyingTo.is_me ? 'yourself' : replyingTo.sender_name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {replyingTo.content || '📷 Photo'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full shrink-0" onClick={() => setReplyingTo(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {imagePreview && (
                <div className="relative w-32 h-32 bg-muted rounded-2xl overflow-hidden border-2 border-primary/30 shadow-md group">
                  <img src={imagePreview} className="w-full h-full object-cover" alt="preview" />
                  <button 
                    onClick={() => { 
                      setImageFile(null); 
                      if (imagePreview?.startsWith('blob:')) {
                        try { URL.revokeObjectURL(imagePreview); } catch {}
                      }
                      setImagePreview(null); 
                    }} 
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                <Button variant="ghost" size="icon" className="rounded-full shrink-0 h-11 w-11" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon className="w-5 h-5" />
                </Button>
                
                <div className="flex-1 relative">
                  <Textarea 
                    value={messageInput} 
                    onChange={(e) => handleInputChange(e.target.value)} 
                    placeholder="Type a message..." 
                    className="min-h-[48px] max-h-32 py-3.5 pr-12 resize-none rounded-3xl bg-muted/60 border-border/50 focus:border-primary focus:bg-background transition-all"
                    onKeyDown={handleKeyPress}
                    rows={1}
                  />
                  <div className="absolute right-4 bottom-3 text-[10px] text-muted-foreground/60 pointer-events-none">
                    {messageInput.length > 0 && messageInput.length}
                  </div>
                </div>

                <Button 
                  size="icon" 
                  onClick={() => {
                    if ((messageInput.trim() || imageFile) && !sendMessage.isPending) {
                      sendMessage.mutate({ content: messageInput.trim() || null, file: imageFile });
                      setReplyingTo(null);
                    }
                  }}
                  disabled={sendMessage.isPending || (!messageInput.trim() && !imageFile)}
                  className="rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 transition-transform active:scale-95"
                >
                  {sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              {isMuted ? (
                <>
                  <p className="text-sm text-muted-foreground">You are muted in this community</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Until {myMembership?.muted_until && new Date(myMembership.muted_until).toLocaleString()}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Join this community to send messages</p>
                  <Button className="mt-2" onClick={() => joinCommunity.mutate(selectedChat.id)}>
                    Join Community
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat list view
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-background via-background to-background/80 backdrop-blur-xl pt-4 px-4 pb-2">
        <div className="container-mobile py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Messages</h1>
          <Button 
            size="icon" 
            variant="ghost" 
            className="rounded-full"
            onClick={() => activeTab === 'dm' ? setIsNewChatOpen(true) : setIsCreateCommunityOpen(true)}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search conversations..." 
            className="pl-10 bg-muted/50 rounded-xl border-muted-foreground/20 focus:border-primary" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatMode)} className="px-4">
        <TabsList className="w-full bg-muted/50 rounded-xl p-1 mb-4">
          <TabsTrigger value="dm" className="flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MessageSquare className="w-4 h-4 mr-2" /> Direct
          </TabsTrigger>
          <TabsTrigger value="community" className="flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="w-4 h-4 mr-2" /> Communities
          </TabsTrigger>
        </TabsList>

        {/* DM Tab */}
        <TabsContent value="dm" className="space-y-2 mt-0">
          {loadingDMs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : dmList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 opacity-60">
              <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-bold text-xl mb-2">No conversations yet</h3>
              <Button onClick={() => setIsNewChatOpen(true)} className="rounded-full mt-4">Start a Chat</Button>
            </div>
          ) : (
            dmList.filter((d) => d.name.toLowerCase().includes(debouncedSearch.toLowerCase())).map((dm) => (
              <div 
                key={dm.id} 
                className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-2xl transition-all cursor-pointer bg-gradient-to-r from-background to-muted/5 group"
                onClick={() => setSelectedChat({ type: 'dm', id: dm.id, partner_id: dm.partner_id, name: dm.name, avatar: dm.avatar, is_online: dm.is_online })}
              >
                <div className="relative">
                  <Avatar className="h-14 w-14 ring-2 ring-background shadow-md group-hover:shadow-lg transition-all">
                    <AvatarImage src={dm.avatar} />
                    <AvatarFallback>{dm.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                  </Avatar>
                  {dm.is_online && (
                    <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-[15px] truncate group-hover:text-primary transition-colors">{dm.name}</h3>
                    <span className="text-[11px] text-muted-foreground font-medium">{formatTime(dm.time)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{dm.last_msg}</p>
                </div>
                {dm.unread_count > 0 && (
                  <Badge className="bg-primary text-primary-foreground rounded-full min-w-[20px] h-5 flex items-center justify-center text-[11px] font-bold">
                    {dm.unread_count > 99 ? '99+' : dm.unread_count}
                  </Badge>
                )}
              </div>
            ))
          )}
        </TabsContent>

        {/* Communities Tab */}
        <TabsContent value="community" className="space-y-2 mt-0">
          {loadingComms ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : commList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 opacity-60">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-bold text-xl mb-2">No communities yet</h3>
              <Button onClick={() => setIsCreateCommunityOpen(true)} className="rounded-full mt-4">Create Community</Button>
            </div>
          ) : (
            commList.filter((c) => c.name.toLowerCase().includes(debouncedSearch.toLowerCase())).map((comm) => (
              <div key={comm.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-2xl transition-all bg-gradient-to-r from-background to-muted/5 group">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md cursor-pointer group-hover:shadow-lg transition-all" 
                  onClick={() => setSelectedChat({ 
                    type: 'community', 
                    id: comm.id, 
                    name: comm.name, 
                    avatar: comm.cover || comm.cover_url || comm.avatar, 
                    cover: comm.cover || comm.cover_url,
                    cover_url: comm.cover_url,
                    description: comm.description, 
                    my_role: comm.my_role, 
                    member_count: comm.member_count 
                  })}>
                  <AvatarImage src={comm.cover || comm.cover_url || comm.avatar} />
                  <AvatarFallback>{comm.name?.[0]?.toUpperCase() || 'C'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedChat({ type: 'community', id: comm.id, name: comm.name, cover: comm.cover_url, description: comm.description, my_role: comm.my_role, member_count: comm.member_count })}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[15px] truncate group-hover:text-primary transition-colors">{comm.name}</h3>
                    {comm.my_role === 'admin' && <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200">Admin</Badge>}
                    {comm.my_role === 'moderator' && <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200">Mod</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3 h-3"/> {comm.member_count} member{comm.member_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant={comm.my_role !== 'none' ? "outline" : "default"} 
                  className="rounded-full px-5 transition-transform active:scale-95"
                  onClick={() => comm.my_role !== 'none' ? setSelectedChat({ type: 'community', id: comm.id, name: comm.name, cover: comm.cover_url, description: comm.description, my_role: comm.my_role, member_count: comm.member_count }) : joinCommunity.mutate(comm.id)}
                >
                  {comm.my_role !== 'none' ? "Open" : "Join"}
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* New Chat Dialog */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] h-[85vh] flex flex-col p-0 gap-0">
          {/* Header - Fixed */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-xl">New Message</DialogTitle>
            <DialogDescription>
              {friends.length > 0 
                ? `Start a conversation with ${friends.length} friend${friends.length !== 1 ? 's' : ''}`
                : "Start a conversation with your friends"
              }
            </DialogDescription>
          </DialogHeader>
          
          {/* Search - Fixed */}
          {friends.length > 0 && (
            <div className="px-6 py-4 bg-muted/10 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search friends..." 
                  className="pl-10 bg-muted/50 rounded-xl border-muted-foreground/20 focus:border-primary" 
                  value={friendSearch} 
                  onChange={(e) => setFriendSearch(e.target.value)} 
                />
              </div>
            </div>
          )}
      
          {/* ✅ Scrollable Content - This is the key fix */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6">
            <div className="space-y-6 pb-6 pt-2">
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No friends yet</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Add friends to start messaging them directly
                  </p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground">
                    Try searching with a different name
                  </p>
                </div>
              ) : (
                <>
                  {onlineFriends.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Online • {onlineFriends.length}
                        </h3>
                      </div>
                      <div className="space-y-1">
                        {onlineFriends.map((f: any) => (
                          <div 
                            key={f.id} 
                            onClick={() => { 
                              setSelectedChat({ type: 'dm', id: f.id, partner_id: f.id, name: f.name, avatar: f.avatar, is_online: f.is_online }); 
                              setIsNewChatOpen(false); 
                            }} 
                            className="flex items-center gap-3 p-3 hover:bg-muted/60 rounded-xl cursor-pointer transition-all group"
                          >
                            <div className="relative">
                              <Avatar className="h-12 w-12 ring-2 ring-background">
                                <AvatarImage src={f.avatar} />
                                <AvatarFallback>{f.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-green-500 rounded-full border-2 border-background" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[15px] truncate">{f.name}</p>
                              <p className="text-xs text-green-600 font-medium">Active now</p>
                            </div>
                            <MessageSquare className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
      
                  {offlineFriends.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          All Friends • {offlineFriends.length}
                        </h3>
                      </div>
                      <div className="space-y-1">
                        {offlineFriends.map((f: any) => (
                          <div 
                            key={f.id} 
                            onClick={() => { 
                              setSelectedChat({ type: 'dm', id: f.id, partner_id: f.id, name: f.name, avatar: f.avatar, is_online: f.is_online }); 
                              setIsNewChatOpen(false); 
                            }} 
                            className="flex items-center gap-3 p-3 hover:bg-muted/60 rounded-xl cursor-pointer transition-all group"
                          >
                            <Avatar className="h-12 w-12 ring-2 ring-background opacity-90 group-hover:opacity-100 transition-opacity">
                              <AvatarImage src={f.avatar} />
                              <AvatarFallback>{f.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[15px] truncate">{f.name}</p>
                              {f.last_seen && (
                                <p className="text-xs text-muted-foreground">
                                  Active {formatDistanceToNow(new Date(f.last_seen), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                            <MessageSquare className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Community Dialog */}
      <Dialog open={isCreateCommunityOpen} onOpenChange={(open) => {
        setIsCreateCommunityOpen(open);
        if (!open) {
          setNewCommName('');
          setNewCommDesc('');
          setNewCommCoverFile(null);
          if (newCommCoverPreview?.startsWith('blob:')) {
            try { URL.revokeObjectURL(newCommCoverPreview); } catch {}
          }
          setNewCommCoverPreview(null);
        }
      }}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto">
          <DialogHeader>
            <DialogTitle>Create Community</DialogTitle>
            <DialogDescription>Create a space for your community to connect</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Cover Image Upload */}
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp" 
                className="hidden" 
                ref={coverInputRef} 
                onChange={handleCoverSelect} 
              />
              {newCommCoverPreview ? (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-dashed border-primary/30 group">
                  <img src={newCommCoverPreview} className="w-full h-full object-cover" alt="Cover preview" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setNewCommCoverFile(null);
                        if (newCommCoverPreview?.startsWith('blob:')) {
                          try { URL.revokeObjectURL(newCommCoverPreview); } catch {}
                        }
                        setNewCommCoverPreview(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Upload cover image</span>
                </button>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Community Name *</Label>
              <Input placeholder="Enter community name" value={newCommName} onChange={(e) => setNewCommName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="What's this community about?" value={newCommDesc} onChange={(e) => setNewCommDesc(e.target.value)} rows={4} maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCommunityOpen(false)}>Cancel</Button>
            <Button onClick={() => createCommunity.mutate()} disabled={!newCommName.trim() || createCommunity.isPending}>
              {createCommunity.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
