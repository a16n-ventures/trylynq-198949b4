import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Search, Send, ArrowLeft, Plus, Users, 
  MessageSquare, X, Loader2, Info, 
  Image as ImageIcon, Calendar, MapPin, Ticket,
  Check, Crown, Lock
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";


// Components
import { MessageBubble } from '@/components/messages/MessageBubble';
import { useScrollToBottom } from '@/hooks/useScrollToBottom';
import { useChatRealtime } from '@/hooks/useChatRealtime';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { TypingIndicator } from '@/components/messages/TypingIndicator';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { CommunitySettingsDialog } from '@/components/messages/CommunitySettingsDialog';
import { CommunityModerationDialog } from '@/components/messages/CommunityModerationDialog';
import { Settings, Shield } from 'lucide-react';

// --- TYPES ---
type ChatType = 'dm' | 'community' | 'event';

interface ChatItem {
  id: string;
  type: ChatType;
  name: string;
  avatar?: string;
  subtitle?: string; // Last message or date
  badge?: string | number; // Unread count
  meta?: any; // Extra data (event date, role, etc)
  partner_id?: string; // For DMs
}

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState<ChatType>('dm');
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  
  // Hooks
  const { scrollRef, scrollToBottom } = useScrollToBottom([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. INITIALIZATION & DEEP LINKING ---
  // Redirect "Create Vibe Check" to CreateEvent page
  useEffect(() => {
    if (showNewEventModal) {
      setShowNewEventModal(false);
      navigate('/create-event');
    }
  }, [showNewEventModal, navigate]);

  useEffect(() => {
    const type = searchParams.get('type') as ChatType;
    const id = searchParams.get('id');
    
    if (type && id && user) {
      setActiveTab(type);
      fetchChatDetails(type, id).then(chat => {
        if (chat) setSelectedChat(chat);
      });
    }
  }, [searchParams, user]);

  const fetchChatDetails = async (type: ChatType, id: string): Promise<ChatItem | null> => {
    if (type === 'event') {
      const { data } = await supabase.from('events').select('*').eq('id', id).single();
      return data ? {
        id: data.id, type: 'event', name: data.title, avatar: data.image_url,
        meta: { date: data.start_date, location: data.location }
      } : null;
    } else if (type === 'community') {
      const { data } = await supabase.from('communities').select('*').eq('id', id).single();
      return data ? {
        id: data.id, type: 'community', name: data.name, avatar: data.cover_url
      } : null;
    } else {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', id).single();
      return data ? {
        id: id, type: 'dm', name: data.display_name, avatar: data.avatar_url, partner_id: id
      } : null;
    }
  };

  // --- 2. DATA FETCHING (The Clyx Lists) ---
  
  // A. DIRECT MESSAGES
  const { data: dmList = [] } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch recent messages to build conversation list
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (!msgs || msgs.length === 0) return [];
      
      // Build unique partner list
      const partnerMap = new Map<string, { partner_id: string; last_message: string; unread_count: number }>();
      for (const m of msgs) {
        const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            partner_id: partnerId,
            last_message: m.content || '',
            unread_count: m.receiver_id === user.id && !m.is_read ? 1 : 0
          });
        } else if (m.receiver_id === user.id && !m.is_read) {
          const existing = partnerMap.get(partnerId)!;
          existing.unread_count++;
        }
      }
      
      // Fetch profiles for partners
      const partnerIds = Array.from(partnerMap.keys());
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', partnerIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      
      return Array.from(partnerMap.values()).map(p => {
        const profile = profileMap.get(p.partner_id);
        return {
          id: p.partner_id,
          type: 'dm' as const,
          name: profile?.display_name || 'User',
          avatar: profile?.avatar_url,
          subtitle: p.last_message,
          partner_id: p.partner_id,
          badge: p.unread_count > 0 ? p.unread_count : undefined
        };
      });
    },
    enabled: !!user && activeTab === 'dm'
  });

  // B. COMMUNITIES
  const { data: commList = [], refetch: refetchCommunities } = useQuery({
    queryKey: ['comm_list_chat', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch ALL communities (not just joined)
      const { data: communities } = await supabase
        .from('communities')
        .select('*')
        .order('member_count', { ascending: false });

      if (!communities) return [];

      // Fetch my memberships to know which I've joined
      const { data: memberData } = await supabase
        .from('community_members')
        .select('community_id, role')
        .eq('user_id', user.id);

      const memberMap = new Map((memberData || []).map((m: any) => [m.community_id, m.role]));

      // Deduplicate by name
      const byName = new Map<string, any>();
      for (const c of communities) {
        const existing = byName.get(c.name);
        if (!existing || (c.member_count || 0) > (existing.member_count || 0)) {
          byName.set(c.name, c);
        }
      }

      return Array.from(byName.values()).map((c: any) => ({
        id: c.id,
        type: 'community',
        name: c.name,
        avatar: c.cover_url,
        subtitle: `${c.member_count || 0} members`,
        meta: { 
          is_joined: memberMap.has(c.id),
          my_role: memberMap.get(c.id) || null,
          is_premium: c.is_premium || false,
          join_fee: c.join_fee || 0,
          description: c.description,
        }
      })) as ChatItem[];
    },
    enabled: !!user && activeTab === 'community'
  });

  // C. VIBE CHECKS (Events)
  const { data: eventList = [], refetch: refetchEvents } = useQuery({
    queryKey: ['event_list_chat', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch events I am attending
      const { data } = await supabase
        .from('event_attendees')
        .select('event:events(*)')
        .eq('user_id', user.id);
      
      return (data || []).map((item: any) => ({
        id: item.event.id,
        type: 'event',
        name: item.event.title,
        avatar: item.event.image_url,
        subtitle: new Date(item.event.start_date).toLocaleDateString(),
        meta: {
          date: item.event.start_date,
          location: item.event.location
        }
      })) as ChatItem[];
    },
    enabled: !!user && activeTab === 'event'
  });

  // --- 3. MESSAGES QUERY (Unified) ---
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['messages', selectedChat?.type, selectedChat?.id],
    queryFn: async () => {
      if (!user || !selectedChat) return [];
      
      let query;
      if (selectedChat.type === 'dm') {
        query = supabase.from('messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`);
      } else if (selectedChat.type === 'community') {
        query = supabase.from('community_messages')
          .select(`*, sender:profiles!sender_id(*)`)
          .eq('community_id', selectedChat.id);
      } else {
        // Event Chats - no FK to profiles, so fetch separately
        query = supabase.from('event_chats')
          .select('*')
          .eq('event_id', selectedChat.id);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) console.error(error);
      
      // For event chats, fetch sender profiles separately
      let profileMap = new Map<string, any>();
      if (selectedChat.type === 'event' && data?.length) {
        const userIds = [...new Set(data.map((m: any) => m.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);
        profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      }
      
      return (data || []).map((m: any) => {
        const senderId = m.sender_id || m.user_id;
        const profile = profileMap.get(senderId);
        return {
          id: m.id,
          content: m.content || m.message,
          sender_id: senderId,
          sender_name: m.sender?.display_name || profile?.display_name || 'User',
          sender_avatar: m.sender?.avatar_url || profile?.avatar_url,
          created_at: m.created_at,
          is_me: senderId === user.id,
          image_url: m.image_url
        };
      });
    },
    enabled: !!selectedChat,
    refetchInterval: 3000 // Simple polling for realtime feel
  });

  // --- 4. SEND MESSAGE (Unified) ---
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !selectedChat || !messageInput.trim()) return;
      
      const text = messageInput.trim();
      setMessageInput(''); // Optimistic clear

      let error;
      if (selectedChat.type === 'dm') {
        const { error: e } = await supabase.from('messages').insert({
          sender_id: user.id, receiver_id: selectedChat.partner_id, content: text
        });
        error = e;
      } else if (selectedChat.type === 'community') {
        const { error: e } = await supabase.from('community_messages').insert({
          community_id: selectedChat.id, sender_id: user.id, content: text
        });
        error = e;
      } else {
        // NEW: Event Chats
        const { error: e } = await supabase.from('event_chats').insert({
          event_id: selectedChat.id, user_id: user.id, message: text
        });
        error = e;
      }
      
      if (error) throw error;
      refetchMessages();
    }
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);


  // --- 5. HANDLE "ADD NEW" CLICK ---
  const handleAddNew = () => {
    switch (activeTab) {
      case 'dm':
        setShowNewDmModal(true);
        break;
      case 'community':
        setShowNewGroupModal(true);
        break;
      case 'event':
        setShowNewEventModal(true);
        break;
    }
  };


  // --- RENDER ---
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      
      {/* LEFT SIDEBAR (Chat List) */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-muted/10 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-4">
             <h1 className="text-xl font-bold">Messages</h1>
             <Button size="icon" variant="ghost" className="rounded-full bg-primary/10 text-primary hover:bg-primary/20" onClick={handleAddNew}>
                <Plus className="w-5 h-5" />
             </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              className="pl-9 bg-muted/50 border-0 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* TABS (The Clyx 3-Pillar Nav) */}
        <div className="px-2 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatType)} className="w-full">
            <TabsList className="w-full bg-muted/50 p-1 rounded-xl grid grid-cols-3">
              <TabsTrigger value="dm" className="rounded-lg text-xs">Direct</TabsTrigger>
              <TabsTrigger value="community" className="rounded-lg text-xs">Groups</TabsTrigger>
              <TabsTrigger value="event" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                 Vibe Checks
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'dm' && dmList.map(chat => (
            <ChatListItem key={chat.id} chat={chat} isSelected={selectedChat?.id === chat.id} onClick={() => setSelectedChat(chat)} />
          ))}
          
          {activeTab === 'community' && commList.map(chat => (
            <CommunityListItem 
              key={chat.id} 
              chat={chat} 
              isSelected={selectedChat?.id === chat.id} 
              onClick={async () => {
                const meta = chat.meta as any;
                if (!meta?.is_joined) {
                  // Handle Premium community join — must pay first
                  if (meta?.is_premium && meta?.join_fee > 0) {
                    const flwKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
                    if (!flwKey || !window.FlutterwaveCheckout) {
                      toast.error('Payment system not available');
                      return;
                    }
                    window.FlutterwaveCheckout({
                      public_key: flwKey,
                      tx_ref: `community-${chat.id}-${user?.id}-${Date.now()}`,
                      amount: meta.join_fee,
                      currency: "NGN",
                      payment_options: "card, banktransfer, ussd",
                      customer: { email: user?.email || "user@app.com", name: user?.email || "User" },
                      customizations: {
                        title: "Premium Community",
                        description: `Join "${chat.name}" — ₦${meta.join_fee.toLocaleString()}`,
                        logo: "",
                      },
                      callback: async (response: any) => {
                        try {
                          await supabase.from('payments').insert({
                            user_id: user?.id,
                            amount: meta.join_fee,
                            status: 'success',
                            tx_ref: `community-${chat.id}-${user?.id}-${Date.now()}`,
                            flw_ref: response.flw_ref || response.transaction_id?.toString(),
                          });
                          await supabase.from('community_members').insert({
                            community_id: chat.id,
                            user_id: user?.id,
                            role: 'member'
                          });
                          toast.success(`Joined ${chat.name}! 🎉`);
                          refetchCommunities();
                          setSelectedChat(chat);
                        } catch (err: any) {
                          console.error('Community join error:', err);
                          toast.error('Failed to join community');
                        }
                      },
                      onclose: () => {
                        toast.info('Payment cancelled');
                      },
                    });
                    return; // Stop — don't auto-join
                  }
                  // Free community join
                  await supabase.from('community_members').insert({
                    community_id: chat.id,
                    user_id: user?.id,
                    role: 'member'
                  });
                  toast.success(`Joined ${chat.name}!`);
                  refetchCommunities();
                }
                setSelectedChat(chat);
              }}
            />
          ))}

          {activeTab === 'event' && eventList.length > 0 ? (
            eventList.map(chat => (
               <ChatListItem key={chat.id} chat={chat} isSelected={selectedChat?.id === chat.id} onClick={() => setSelectedChat(chat)} />
            ))
          ) : activeTab === 'event' && (
            <div className="p-8 text-center text-muted-foreground">
               <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
               <p className="text-sm">RSVP to events to join their Vibe Check chats!</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR (Active Chat) */}
      <ChatView 
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        sendMessage={sendMessage}
        messages={messages}
        scrollRef={scrollRef}
        user={user}
      />

      {/* --- MODALS --- */}
      
      {/* 1. NEW DM MODAL */}
      <NewChatModal open={showNewDmModal} onOpenChange={setShowNewDmModal} onSelect={(user) => {
         setSelectedChat({
            id: user.user_id,
            type: 'dm',
            name: user.display_name,
            avatar: user.avatar_url,
            partner_id: user.user_id
         });
         setShowNewDmModal(false);
      }} />

      {/* 2. NEW COMMUNITY MODAL */}
      <NewCommunityModal open={showNewGroupModal} onOpenChange={setShowNewGroupModal} onSuccess={() => {
         refetchCommunities();
         setShowNewGroupModal(false);
      }} />

    </div>
  );
}

// --- ChatView: Extracted to use hooks at top level ---
function ChatView({ selectedChat, setSelectedChat, messageInput, setMessageInput, sendMessage, messages, scrollRef, user }: {
  selectedChat: ChatItem | null; setSelectedChat: (c: ChatItem | null) => void;
  messageInput: string; setMessageInput: (v: string) => void; sendMessage: any;
  messages: any[]; scrollRef: any; user: any;
}) {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [showModeration, setShowModeration] = useState(false);

  // Message reactions
  const messageIds = useMemo(() => messages.map((m: any) => m.id), [messages]);
  const { reactions, addReaction } = useMessageReactions(
    messageIds,
    user?.id,
    selectedChat?.type === 'community'
  );

  // Community metadata
  const { data: communityMeta } = useQuery({
    queryKey: ['community_meta_chat', selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat || selectedChat.type !== 'community') return null;
      const [{ data: comm }, { data: membership }] = await Promise.all([
        supabase.from('communities').select('*').eq('id', selectedChat.id).single(),
        supabase.from('community_members').select('role').eq('community_id', selectedChat.id).eq('user_id', user?.id).maybeSingle()
      ]);
      return { ...comm, my_role: membership?.role || 'none' };
    },
    enabled: !!selectedChat && selectedChat.type === 'community' && !!user,
  });

  const myCommRole = communityMeta?.my_role || 'none';
  const canModerate = myCommRole === 'admin' || myCommRole === 'moderator';

  if (!selectedChat) {
    return (
      <div className={`flex-1 flex flex-col bg-background h-full hidden md:flex`}>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-10 h-10 opacity-20" />
          </div>
          <h3 className="text-xl font-bold mb-2">Select a Conversation</h3>
          <p className="max-w-xs mx-auto">
            Join a <strong>Vibe Check</strong> from an event, chat with a community, or DM a friend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-background h-full ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
      {/* CHAT HEADER */}
      <div className="h-16 border-b flex items-center justify-between px-4 bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setSelectedChat(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={selectedChat.avatar} />
            <AvatarFallback>{selectedChat.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-bold text-sm">{selectedChat.name}</h2>
            {selectedChat.type === 'event' ? (
               <p className="text-xs text-primary flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Vibe Check Chat
               </p>
            ) : (
               <p className="text-xs text-muted-foreground">
                  {selectedChat.type === 'community' ? 'Community' : 'Online'}
               </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {selectedChat.type === 'event' && (
             <Button size="sm" variant="secondary" className="gap-2 rounded-full" onClick={() => navigate('/app/feed')}>
                <Ticket className="w-4 h-4" /> View Event
             </Button>
          )}
          {selectedChat.type === 'community' && canModerate && (
            <Button size="icon" variant="ghost" onClick={() => setShowModeration(true)}>
              <Shield className="w-5 h-5" />
            </Button>
          )}
          {selectedChat.type === 'community' && canModerate && (
            <Button size="icon" variant="ghost" onClick={() => setShowSettings(true)}>
              <Settings className="w-5 h-5" />
            </Button>
          )}
          {selectedChat.type === 'community' && !canModerate && (
            <Button size="icon" variant="ghost" onClick={() => setShowSettings(true)}>
              <Info className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-muted/5 to-background" ref={scrollRef}>
         {messages.map((msg: any, i: number) => {
           const msgReactions = reactions[msg.id] || [];
           return (
             <MessageBubble 
               key={msg.id} 
               msg={msg} 
               prevMsg={i > 0 ? messages[i-1] : null}
               isComm={selectedChat.type !== 'dm'}
               canModerate={canModerate}
               onDelete={() => {}}
               onReply={() => {}}
               onEdit={async () => {}}
               scrollToId={() => {}}
               onReact={(msgId: string, emoji: string) => addReaction({ messageId: msgId, emoji })}
               reactions={msgReactions}
             />
           );
         })}
         {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-40">
               <MessageSquare className="w-12 h-12 mb-2" />
               <p>Start the vibe...</p>
            </div>
         )}
      </div>

      {/* INPUT AREA */}
      <ChatInputArea selectedChat={selectedChat} messageInput={messageInput} setMessageInput={setMessageInput} sendMessage={sendMessage} />

      {/* COMMUNITY SETTINGS DIALOG */}
      {selectedChat.type === 'community' && communityMeta && (
        <>
          <CommunitySettingsDialog
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            communityId={selectedChat.id}
            currentName={communityMeta.name || selectedChat.name}
            currentDesc={communityMeta.description || ''}
            currentCoverUrl={communityMeta.cover_url}
          />
          <CommunityModerationDialog
            isOpen={showModeration}
            onClose={() => setShowModeration(false)}
            communityId={selectedChat.id}
            communityName={selectedChat.name}
            myRole={myCommRole as any}
          />
        </>
      )}
    </div>
  );
}

// --- Chat Input with Payment Gate (Admin/Creator bypass) ---
function ChatInputArea({ selectedChat, messageInput, setMessageInput, sendMessage }: { 
  selectedChat: ChatItem; messageInput: string; setMessageInput: (v: string) => void; sendMessage: any 
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user has paid OR is admin/creator (bypass payment)
  const { data: hasPaid, isLoading: checkingPayment } = useQuery({
    queryKey: ['chat-payment-check', selectedChat.id, selectedChat.type, user?.id],
    queryFn: async () => {
      if (!user) return true;
      
      // Check if user is platform admin (always bypass)
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .maybeSingle();
      if (adminRole) return true;

      if (selectedChat.type === 'event') {
        const { data: event } = await supabase.from('events').select('ticket_price, creator_id').eq('id', selectedChat.id).single();
        if (!event?.ticket_price || event.ticket_price <= 0) return true;
        // Event creator bypasses payment
        if (event.creator_id === user.id) return true;
        
        const { data: payment } = await supabase.from('payments')
          .select('id').eq('user_id', user.id)
          .ilike('tx_ref', `%event-${selectedChat.id}%`)
          .eq('status', 'success').maybeSingle();
        return !!payment;
      }
      
      if (selectedChat.type === 'community') {
        const { data: comm } = await supabase.from('communities').select('is_premium, join_fee, creator_id').eq('id', selectedChat.id).single();
        if (!comm?.is_premium || !comm?.join_fee || comm.join_fee <= 0) return true;
        // Community creator bypasses payment
        if (comm.creator_id === user.id) return true;
        // Community admins/mods bypass payment
        const { data: membership } = await supabase.from('community_members')
          .select('role').eq('community_id', selectedChat.id).eq('user_id', user.id).maybeSingle();
        if (membership?.role === 'admin' || membership?.role === 'moderator') return true;
        
        const { data: payment } = await supabase.from('payments')
          .select('id').eq('user_id', user.id)
          .ilike('tx_ref', `%community-${selectedChat.id}%`)
          .eq('status', 'success').maybeSingle();
        return !!payment;
      }
      
      return true;
    },
    enabled: !!user && !!selectedChat,
  });

  if (!hasPaid && !checkingPayment) {
    return (
      <div className="p-4 border-t bg-background">
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl">
          <Lock className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Payment Required</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">Complete your payment to send messages here.</p>
          </div>
          <Button size="sm" className="shrink-0 rounded-full" onClick={() => navigate('/app/feed')}>
            Pay Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-t bg-background">
       <div className="flex items-end gap-2 bg-muted/50 p-2 rounded-3xl border focus-within:border-primary/50 transition-colors">
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10 text-muted-foreground">
             <Plus className="w-5 h-5" />
          </Button>
          <Textarea 
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Message ${selectedChat.name}...`}
            className="flex-1 min-h-[40px] max-h-32 bg-transparent border-0 focus-visible:ring-0 resize-none py-2.5"
            onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage.mutate();
               }
            }}
          />
          <Button 
            size="icon" 
            className="rounded-full h-10 w-10 shrink-0" 
            disabled={!messageInput.trim()}
            onClick={() => sendMessage.mutate()}
          >
             <Send className="w-4 h-4" />
          </Button>
       </div>
    </div>
  );
}

// Sub-component for List Items
function ChatListItem({ chat, isSelected, onClick }: { chat: ChatItem, isSelected: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
    >
      <div className="relative">
        <Avatar className="h-12 w-12 border bg-muted">
           <AvatarImage src={chat.avatar} className="object-cover" />
           <AvatarFallback>{chat.name[0]}</AvatarFallback>
        </Avatar>
        {chat.type === 'event' && (
           <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
              <div className="bg-orange-500 rounded-full p-1 text-white">
                 <Calendar className="w-2.5 h-2.5" />
              </div>
           </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
         <div className="flex justify-between items-center mb-0.5">
            <h4 className={`font-semibold text-sm truncate ${isSelected ? 'text-primary' : ''}`}>{chat.name}</h4>
             {chat.meta?.date && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(chat.meta.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
             )}
         </div>
         <p className="text-xs text-muted-foreground truncate">{chat.subtitle || 'Tap to chat'}</p>
      </div>
      {chat.badge && (
         <Badge className="h-5 min-w-[20px] rounded-full px-1.5 flex items-center justify-center">
            {chat.badge}
         </Badge>
      )}
    </div>
  );
}

// --- Community List Item (with join/premium indicators) ---
function CommunityListItem({ chat, isSelected, onClick }: { chat: ChatItem, isSelected: boolean, onClick: () => void }) {
  const meta = chat.meta as any;
  const isJoined = meta?.is_joined;
  const isPremium = meta?.is_premium;
  
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
    >
      <div className="relative">
        <Avatar className="h-12 w-12 border bg-muted">
           <AvatarImage src={chat.avatar} className="object-cover" />
           <AvatarFallback>{chat.name[0]}</AvatarFallback>
        </Avatar>
        {isPremium && (
          <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5">
            <Crown className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
         <div className="flex justify-between items-center mb-0.5">
            <h4 className={`font-semibold text-sm truncate ${isSelected ? 'text-primary' : ''}`}>{chat.name}</h4>
         </div>
         <p className="text-xs text-muted-foreground truncate">{chat.subtitle || 'Tap to chat'}</p>
      </div>
      {!isJoined && (
        <Badge variant="outline" className="text-[10px] shrink-0">
          {isPremium ? `₦${meta?.join_fee?.toLocaleString()}` : 'Join'}
        </Badge>
      )}
      {isJoined && meta?.my_role === 'admin' && (
        <Badge variant="secondary" className="text-[10px] shrink-0">Admin</Badge>
      )}
    </div>
  );
}


function NewChatModal({ open, onOpenChange, onSelect }: { open: boolean, onOpenChange: (o: boolean) => void, onSelect: (u: any) => void }) {
    const [search, setSearch] = useState('');
    const { data: users = [] } = useQuery({
        queryKey: ['user_search', search],
        queryFn: async () => {
            if (!search.trim()) return [];
            const { data } = await supabase.from('profiles').select('*').ilike('display_name', `%${search}%`).limit(10);
            return data || [];
        },
        enabled: open && search.length > 1
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>New Message</DialogTitle></DialogHeader>
                <Input placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4" />
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {users.map(u => (
                        <div key={u.user_id} onClick={() => onSelect(u)} className="flex items-center gap-3 p-2 hover:bg-muted rounded-lg cursor-pointer">
                            <Avatar><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.display_name[0]}</AvatarFallback></Avatar>
                            <span>{u.display_name}</span>
                        </div>
                    ))}
                    {users.length === 0 && search && <p className="text-center text-muted-foreground text-sm">No users found</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// --- NEW COMMUNITY MODAL (with file upload) ---
function NewCommunityModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (o: boolean) => void, onSuccess: () => void }) {
    const { user } = useAuth();
    const [form, setForm] = useState({ name: '', description: '', is_premium: false, join_fee: '' });
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const fileRef = React.useRef<HTMLInputElement>(null);

    const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
        if (!file.type.startsWith('image/')) return toast.error("Images only");
        setCoverFile(file);
        setCoverPreview(URL.createObjectURL(file));
    };

    const create = async () => {
        if (!form.name.trim()) return toast.error("Community name is required");
        setLoading(true);
        try {
            let coverUrl: string | null = null;
            if (coverFile && user) {
                const ext = coverFile.name.split('.').pop();
                const path = `${user.id}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('community-covers').upload(path, coverFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('community-covers').getPublicUrl(path);
                coverUrl = publicUrl;
            }

            const { data: community, error } = await supabase.from('communities').insert({
                name: form.name.trim(),
                description: form.description.trim() || null,
                cover_url: coverUrl,
                creator_id: user?.id,
                member_count: 1,
                is_premium: form.is_premium,
                join_fee: form.is_premium && form.join_fee ? parseFloat(form.join_fee) : 0,
            }).select().single();
            if (error) throw error;

            if (community) {
                await supabase.from('community_members').insert({
                    community_id: community.id,
                    user_id: user?.id,
                    role: 'admin'
                });
            }
            toast.success("Community created!");
            setForm({ name: '', description: '', is_premium: false, join_fee: '' });
            setCoverFile(null);
            setCoverPreview(null);
            onSuccess();
        } catch (e: any) {
            toast.error(e?.message || "Failed to create community");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Create Community</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {/* Cover Photo Upload */}
                    <div className="space-y-2">
                        <Label>Cover Photo</Label>
                        {coverPreview ? (
                            <div className="relative w-full h-32 rounded-xl overflow-hidden border bg-muted">
                                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { setCoverFile(null); setCoverPreview(null); }}>
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        ) : (
                            <div 
                                className="w-full h-32 rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => fileRef.current?.click()}
                            >
                                <ImageIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                                <span className="text-xs text-muted-foreground">Tap to add cover photo</span>
                            </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverSelect} />
                    </div>
                    <div className="space-y-2">
                        <Label>Community Name *</Label>
                        <Input placeholder="Tech Meetups, Book Club..." value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea placeholder="What's this group about?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[80px]" />
                    </div>
                    {/* Premium Community Option */}
                    <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-amber-600" />
                            <div>
                                <p className="text-sm font-medium">Premium Community</p>
                                <p className="text-[10px] text-muted-foreground">Members pay to join</p>
                            </div>
                        </div>
                        <input type="checkbox" checked={form.is_premium} onChange={(e) => setForm({ ...form, is_premium: e.target.checked })} className="h-4 w-4 accent-amber-600" />
                    </div>
                    {form.is_premium && (
                        <div className="space-y-2">
                            <Label>Join Fee (₦)</Label>
                            <Input type="number" placeholder="e.g. 5000" value={form.join_fee} onChange={e => setForm({ ...form, join_fee: e.target.value })} min="0" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                    <Button onClick={create} disabled={loading || !form.name.trim()}>
                        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Group'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// NewEventModal removed - consolidated into CreateEvent page
