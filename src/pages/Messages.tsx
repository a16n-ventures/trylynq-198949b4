import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Assuming standard shadcn path or fallback
import { 
  Search, Send, ArrowLeft, Plus, Settings, Users, 
  MessageSquare, X, Loader2, MoreVertical, Info, 
  Image as ImageIcon, Grid, Pin, Calendar, MapPin, Ticket,
  Check, Repeat
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
  useEffect(() => {
    const type = searchParams.get('type') as ChatType;
    const id = searchParams.get('id');
    
    if (type && id && user) {
      setActiveTab(type);
      // We essentially "optimistically" set the chat while data loads
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
      // Fetch communities I'm a member of
      const { data: memberData } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id);

      const joinedIds = (memberData || []).map((m: any) => m.community_id);
      if (joinedIds.length === 0) return [];

      const { data: communities } = await supabase
        .from('communities')
        .select('*')
        .in('id', joinedIds);

      // Deduplicate by name
      const byName = new Map<string, any>();
      for (const c of (communities || [])) {
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
        // NEW: Event Chats table
        query = supabase.from('event_chats')
          .select(`*, sender:profiles!user_id(*)`) // Note: user_id is sender in event_chats schema
          .eq('event_id', selectedChat.id);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) console.error(error);
      
      return (data || []).map((m: any) => ({
        id: m.id,
        content: m.content || m.message, // handle schema diffs
        sender_id: m.sender_id || m.user_id,
        sender_name: m.sender?.display_name || 'User',
        sender_avatar: m.sender?.avatar_url,
        created_at: m.created_at,
        is_me: (m.sender_id || m.user_id) === user.id,
        image_url: m.image_url
      }));
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
            <ChatListItem key={chat.id} chat={chat} isSelected={selectedChat?.id === chat.id} onClick={() => setSelectedChat(chat)} />
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
      <div className={`flex-1 flex flex-col bg-background h-full ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <>
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

              {/* CLYX ACTION BUTTON (Decide -> Do) */}
              {selectedChat.type === 'event' && (
                 <Button size="sm" variant="secondary" className="gap-2 rounded-full" onClick={() => navigate('/app/feed')}>
                    <Ticket className="w-4 h-4" /> View Event
                 </Button>
              )}
              {selectedChat.type === 'community' && (
                 <Button size="icon" variant="ghost"><Info className="w-5 h-5" /></Button>
              )}
            </div>

            {/* MESSAGES AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-muted/5 to-background" ref={scrollRef}>
               {messages.map((msg: any, i: number) => (
                  <MessageBubble 
                    key={msg.id} 
                    msg={msg} 
                    prevMsg={i > 0 ? messages[i-1] : null}
                    isComm={selectedChat.type !== 'dm'}
                    canModerate={false}
                    onDelete={() => {}}
                    onReply={() => {}}
                    onEdit={async () => {}}
                    scrollToId={() => {}}
                  />
               ))}
               {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                     <MessageSquare className="w-12 h-12 mb-2" />
                     <p>Start the vibe...</p>
                  </div>
               )}
            </div>

            {/* INPUT AREA */}
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="w-10 h-10 opacity-20" />
            </div>
            <h3 className="text-xl font-bold mb-2">Select a Conversation</h3>
            <p className="max-w-xs mx-auto">
              Join a <strong>Vibe Check</strong> from an event, chat with a community, or DM a friend.
            </p>
          </div>
        )}
      </div>

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

      {/* 3. NEW EVENT MODAL (With is_program toggle) */}
      <NewEventModal open={showNewEventModal} onOpenChange={setShowNewEventModal} onSuccess={() => {
         refetchEvents();
         setShowNewEventModal(false);
      }} />

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
               <span className="text-[10px] text-muted-foreground">{new Date(chat.meta.date).getDate()}th</span>
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

// --- NEW DM MODAL ---
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
    const [form, setForm] = useState({ name: '', description: '' });
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
                member_count: 1
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
            setForm({ name: '', description: '' });
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

// --- NEW EVENT MODAL (With cover photo upload) ---
function NewEventModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (o: boolean) => void, onSuccess: () => void }) {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        location: '',
        start_date: '',
        end_date: '',
        ticket_price: '',
        category: '',
        max_attendees: '',
        event_type: 'physical' as 'physical' | 'virtual',
        is_public: true,
    });
    
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [isProgram, setIsProgram] = useState(false);
    const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly');
    const [loading, setLoading] = useState(false);
    const fileRef = React.useRef<HTMLInputElement>(null);

    const categories = ['Music', 'Party', 'Tech', 'Sports', 'Arts', 'Food', 'Networking', 'Study Group', 'Social', 'Other'];

    const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
        if (!file.type.startsWith('image/')) return toast.error("Images only");
        setCoverFile(file);
        setCoverPreview(URL.createObjectURL(file));
    };

    const create = async () => {
        if (!formData.title.trim() || !formData.start_date) return toast.error("Title and date are required");
        if (!formData.location.trim() && formData.event_type === 'physical') return toast.error("Location is required for physical events");
        setLoading(true);
        
        let recurrenceRule = null;
        if (isProgram) {
            recurrenceRule = frequency === 'weekly' ? 'FREQ=WEEKLY' : 'FREQ=WEEKLY;INTERVAL=2';
        }

        try {
            // Upload cover photo
            let imageUrl: string | null = null;
            if (coverFile && user) {
                const ext = coverFile.name.split('.').pop();
                const path = `${user.id}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('event_images').upload(path, coverFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('event_images').getPublicUrl(path);
                imageUrl = publicUrl;
            }

            const { error } = await supabase.from('events').insert({
                creator_id: user?.id,
                title: formData.title.trim(),
                description: formData.description.trim() || null,
                location: formData.event_type === 'virtual' ? 'Online' : formData.location.trim(),
                start_date: new Date(formData.start_date).toISOString(),
                end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
                ticket_price: formData.ticket_price ? parseFloat(formData.ticket_price) : 0,
                category: formData.category || null,
                max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
                event_type: formData.event_type,
                is_public: formData.is_public,
                recurrence_rule: recurrenceRule,
                image_url: imageUrl,
            });
            if (error) throw error;
            toast.success("Event created successfully!");
            setFormData({ title: '', description: '', location: '', start_date: '', end_date: '', ticket_price: '', category: '', max_attendees: '', event_type: 'physical', is_public: true });
            setCoverFile(null);
            setCoverPreview(null);
            onSuccess();
        } catch (e: any) {
            toast.error(e?.message || "Failed to create event");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Vibe Check (Event)</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                    {/* Cover Photo Upload */}
                    <div className="space-y-2">
                        {coverPreview ? (
                            <div className="relative w-full h-40 rounded-xl overflow-hidden border bg-muted">
                                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { setCoverFile(null); setCoverPreview(null); }}>
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        ) : (
                            <div 
                                className="w-full h-40 rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => fileRef.current?.click()}
                            >
                                <ImageIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                                <span className="text-sm font-medium text-muted-foreground">Add Cover Photo</span>
                                <span className="text-xs text-muted-foreground/60">Max 5MB • JPG, PNG, WebP</span>
                            </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverSelect} />
                    </div>

                    {/* Event Type */}
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setFormData({...formData, event_type: 'physical'})}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${formData.event_type === 'physical' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}>
                            <MapPin className="w-4 h-4" /> Physical
                        </button>
                        <button type="button" onClick={() => setFormData({...formData, event_type: 'virtual', location: 'Online'})}
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${formData.event_type === 'virtual' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}>
                            <Grid className="w-4 h-4" /> Virtual
                        </button>
                    </div>

                    <div className="grid gap-2">
                        <Label>Event Title *</Label>
                        <Input placeholder="Friday Night Jazz..." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>

                    <div className="grid gap-2">
                        <Label>Description</Label>
                        <Textarea placeholder="Tell people what to expect..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="min-h-[70px]" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label>Start Date & Time *</Label>
                            <Input type="datetime-local" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label>End Date & Time</Label>
                            <Input type="datetime-local" value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} />
                        </div>
                    </div>

                    {formData.event_type === 'physical' && (
                        <div className="grid gap-2">
                            <Label>Location *</Label>
                            <Input placeholder="Lagos, Nigeria" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label>Category</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                <option value="">Select...</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Ticket Price (₦)</Label>
                            <Input type="number" placeholder="0 = Free" min="0" value={formData.ticket_price} onChange={e => setFormData({...formData, ticket_price: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Max Attendees <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Input type="number" placeholder="Leave blank for unlimited" min="1" value={formData.max_attendees} onChange={e => setFormData({...formData, max_attendees: e.target.value})} />
                    </div>

                    <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
                        <div>
                            <Label className="text-sm font-medium">Public Event</Label>
                            <p className="text-xs text-muted-foreground">Anyone can discover and join</p>
                        </div>
                        <Switch checked={formData.is_public} onCheckedChange={(v) => setFormData({...formData, is_public: v})} />
                    </div>

                    <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">Recurring Program?</Label>
                            <p className="text-xs text-muted-foreground">Make this a repeating series</p>
                        </div>
                        <Switch checked={isProgram} onCheckedChange={setIsProgram} />
                    </div>

                    {isProgram && (
                        <div className="grid gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in zoom-in-95">
                            <Label className="text-primary font-semibold flex items-center gap-2">
                                <Repeat className="w-4 h-4" /> Frequency
                            </Label>
                            <div className="flex gap-2 mt-1">
                                <Button type="button" size="sm" variant={frequency === 'weekly' ? 'default' : 'outline'} className="flex-1" onClick={() => setFrequency('weekly')}>Weekly</Button>
                                <Button type="button" size="sm" variant={frequency === 'biweekly' ? 'default' : 'outline'} className="flex-1" onClick={() => setFrequency('biweekly')}>Bi-Weekly</Button>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                    <Button onClick={create} disabled={loading || !formData.title.trim() || !formData.start_date}>
                        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Launch Vibe Check'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
