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
  Check, Crown, Lock, ShieldCheck, Briefcase,
  CreditCard, CheckCircle2, Clock, AlertCircle, Package
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useGeolocation } from '@/contexts/LocationContext';
import { useLaunchZone } from '@/hooks/useLaunchZone';
import { Rocket, UserPlus, Globe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { LaunchZoneGuard } from '@/components/LaunchZoneGuard';
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
import { PremiumBadge } from '@/components/PremiumBadge';

// --- TYPES ---
type ChatType = 'dm' | 'community' | 'event' | 'service';

interface ChatItem {
  id: string;
  type: ChatType;
  name: string;
  avatar?: string;
  subtitle?: string;
  badge?: string | number;
  meta?: any;
  partner_id?: string;
  is_verified?: boolean;
  account_type?: 'personal' | 'business';
}

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { location, isLoading: locationLoading } = useGeolocation();
  const { isInLaunchZone, isWithinCity, isLoading: launchZoneLoading, currentCount, targetCount, cityName }
  = useLaunchZone(location?.latitude, location?.longitude);

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
    const action = searchParams.get('action');
    const itemName = searchParams.get('item');
    const itemPrice = searchParams.get('price');
    const storeName = searchParams.get('store');
    
    if (type && id && user) {
      setActiveTab(type);
      fetchChatDetails(type, id).then(chat => {
        if (chat) {
          setSelectedChat(chat);
          // Pre-fill message input for join requests from Feed
          if (action === 'request') {
            setMessageInput(`Hi! I'd like to request to join "${chat.name}". Please consider my request. Thanks!`);
          } else if (action === 'service-inquiry' && itemName) {
            const priceStr = itemPrice && Number(itemPrice) > 0
              ? ` (listed at ₦${Number(itemPrice).toLocaleString('en-NG')})`
              : '';
            const storeStr = storeName ? ` from ${storeName}` : '';
            setMessageInput(
              `Hi! I'm interested in "${itemName}"${priceStr}${storeStr}. Is it still available? I'd like to know more about delivery and how to proceed. Thanks!`
            );
          }
        }
      });
    }
  }, [searchParams, user]); 
  
  // Add this query near your other queries (after line 67 state declarations)
  const { data: myProfile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });
  const myUserType = myProfile?.account_type;
  
  const fetchChatDetails = async (type: ChatType, id: string): Promise<ChatItem | null> => {
    if (type === 'event') {
      const { data } = await supabase.from('events').select('*').eq('id', id).single();
      if (!data) return null;
      const { data: loc } = await supabase.from('event_locations').select('location_name').eq('event_id', id).maybeSingle();
      return {
        id: data.id, type: 'event', name: data.title, avatar: data.image_url,
        meta: { date: data.start_date, location: loc?.location_name || null }
      };
    } else if (type === 'community') {
      const { data } = await supabase.from('communities').select('*').eq('id', id).single();
      return data ? {
        id: data.id, type: 'community', name: data.name, avatar: data.cover_url
      } : null;
    } else if (type === 'service') {
      // id = business user_id; fetch their profile + store
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('user_id', id).single();
      const { data: store } = await (supabase.from('stores') as any)
        .select('id, name, category').eq('owner_id', id).eq('is_active', true).maybeSingle();
      return profile ? {
        id,
        type: 'service',
        name: profile.display_name || 'Business',
        avatar: profile.avatar_url,
        partner_id: id,
        is_verified: profile.verification_status === 'verified',
        account_type: 'business',
        meta: { store_id: store?.id, store_name: store?.name, store_category: store?.category }
      } : null;
    } else {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', id).single();
      return data ? {
        id: id, type: 'dm', name: data.display_name, avatar: data.avatar_url, partner_id: id,
        is_verified: data.verification_status === 'verified',
        account_type: data.account_type
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
        .select('user_id, display_name, avatar_url, account_type, verification_status, is_premium')
        .in('user_id', partnerIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      
      return Array.from(partnerMap.values()).map(p => {
        const profile = profileMap.get(p.partner_id) as any;
        return {
          id: p.partner_id,
          type: 'dm' as const,
          name: profile?.display_name || 'User',
          avatar: profile?.avatar_url,
          subtitle: p.last_message,
          partner_id: p.partner_id,
          badge: p.unread_count > 0 ? p.unread_count : undefined,
          is_verified: profile?.verification_status === 'verified',
          account_type: profile?.account_type,
          meta: { is_premium: !!profile?.is_premium }
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
      const dedupedCommunities = Array.from(byName.values());

      // Reconcile real member counts from community_members table
      const ids = dedupedCommunities.map((c: any) => c.id);
      const { data: allMembers } = ids.length
        ? await supabase.from('community_members').select('community_id').in('community_id', ids)
        : { data: [] as any[] };
      const realCount = new Map<string, number>();
      (allMembers || []).forEach((m: any) => {
        realCount.set(m.community_id, (realCount.get(m.community_id) || 0) + 1);
      });

      return dedupedCommunities.map((c: any) => {
        const count = realCount.get(c.id) ?? (c.member_count || 0);
        return {
          id: c.id,
          type: 'community',
          name: c.name,
          avatar: c.cover_url,
          subtitle: `${count} ${count === 1 ? 'member' : 'members'}`,
          meta: {
            is_joined: memberMap.has(c.id),
            my_role: memberMap.get(c.id) || null,
            is_premium: c.is_premium || false,
            join_fee: c.join_fee || 0,
            description: c.description,
            member_count: count,
          }
        };
      }) as ChatItem[];
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

  // D. SERVICE CHATS
  const { data: serviceList = [], refetch: refetchServices } = useQuery({
    queryKey: ['service_list_chat', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Fetch service_requests where I am buyer OR seller
      const { data } = await (supabase.from('service_requests') as any)
        .select(`
          id, status, amount, created_at,
          item:store_items(name, image_url),
          buyer:profiles!buyer_id(user_id, display_name, avatar_url),
          seller:profiles!seller_id(user_id, display_name, avatar_url, verification_status)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      return (data || []).map((r: any) => {
        const isBuyer = r.buyer?.user_id === user.id;
        const partner = isBuyer ? r.seller : r.buyer;
        const statusLabel: Record<string, string> = {
          pending: '⏳ Pending',
          accepted: '✅ Accepted',
          in_progress: '🔧 In Progress',
          completed: '🎉 Done',
          disputed: '⚠️ Disputed',
          cancelled: '✗ Cancelled',
        };
        return {
          id: r.id,
          type: 'service' as const,
          name: partner?.display_name || 'Unknown',
          avatar: partner?.avatar_url,
          subtitle: `${r.item?.name || 'Service'} · ${statusLabel[r.status] || r.status}`,
          partner_id: partner?.user_id,
          is_verified: partner?.verification_status === 'verified',
          account_type: 'business' as const,
          meta: {
            request_id: r.id,
            status: r.status,
            amount: r.amount,
            item_name: r.item?.name,
            item_image: r.item?.image_url,
            is_buyer: isBuyer,
          }
        };
      }) as ChatItem[];
    },
    enabled: !!user && activeTab === 'service'
  });
  const messagesQueryKey = ['messages', selectedChat?.type, selectedChat?.id, selectedChat?.partner_id, selectedChat?.meta?.request_id];
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      if (!user || !selectedChat) return [];
      
      let query;
      if (selectedChat.type === 'dm') {
        query = supabase.from('messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.partner_id}),and(sender_id.eq.${selectedChat.partner_id},receiver_id.eq.${user.id})`);
      } else if (selectedChat.type === 'service') {
        query = supabase.from('messages')
          .select('*')
          .eq('request_id', selectedChat.meta?.request_id);
      } else if (selectedChat.type === 'community') {
        query = supabase.from('community_messages')
          .select(`*, sender:profiles!sender_id(*)`)
          .eq('community_id', selectedChat.id);
      } else {
        query = supabase.from('event_chats')
          .select('*')
          .eq('event_id', selectedChat.id);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) console.error(error);
      
      let profileMap = new Map<string, any>();
      if (selectedChat.type === 'event' && data?.length) {
        const userIds = [...new Set(data.map((m: any) => m.user_id))] as string[];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, account_type, is_premium')
          .in('user_id', userIds);

        profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      }
      
      return (data || []).map((m: any) => {
        const senderId = m.sender_id || m.user_id;
        const profile = profileMap.get(senderId);
        const sender = m.sender || profile || {};
        return {
          id: m.id,
          content: m.content || m.message,
          sender_id: senderId,
          sender_name: sender.display_name || 'User',
          sender_avatar: sender.avatar_url,
          sender_is_premium: !!sender.is_premium,
          sender_is_business: sender.account_type === 'business',
          created_at: m.created_at,
          is_me: senderId === user.id,
          image_url: m.image_url,
          pending: false,
        };
      });

    },
    enabled: !!selectedChat,
    // Realtime subscription below pushes new messages instantly; keep a slow
    // poll as a safety net in case the channel drops (e.g. tab returning from
    // background). 3s was overkill and caused flicker + wasted requests.
    refetchInterval: 15000,
  });

  // --- 3b. REALTIME PUSH (replaces 3s polling for instant UX) ---
  useEffect(() => {
    if (!user || !selectedChat) return;
    const c = selectedChat;

    const channelName = `chat-${c.type}-${c.id}-${c.partner_id || ''}-${c.meta?.request_id || ''}`;
    let filter: { table: string; filter?: string } | null = null;

    if (c.type === 'dm' && c.partner_id) {
      filter = { table: 'messages' };
    } else if (c.type === 'service' && c.meta?.request_id) {
      filter = { table: 'messages', filter: `request_id=eq.${c.meta.request_id}` };
    } else if (c.type === 'community') {
      filter = { table: 'community_messages', filter: `community_id=eq.${c.id}` };
    } else if (c.type === 'event') {
      filter = { table: 'event_chats', filter: `event_id=eq.${c.id}` };
    }
    if (!filter) return;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', ...(filter as any) },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          // DM scope check (we can't filter at server level easily)
          if (c.type === 'dm') {
            const valid =
              (row.sender_id === user.id && row.receiver_id === c.partner_id) ||
              (row.sender_id === c.partner_id && row.receiver_id === user.id);
            if (!valid) return;
          }
          refetchMessages();
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedChat?.id, selectedChat?.type, selectedChat?.partner_id, selectedChat?.meta?.request_id, refetchMessages]);

  // --- 4. SEND MESSAGE (Unified, optimistic) ---
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !selectedChat) throw new Error('not_ready');
      const text = messageInput.trim();
      if (!text) throw new Error('empty');

      // Clear input instantly so the keyboard stays open & feels snappy.
      setMessageInput('');

      // Optimistic append: render a "pending" bubble immediately.
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic = {
        id: tempId,
        content: text,
        sender_id: user.id,
        sender_name: 'You',
        sender_avatar: undefined as any,
        created_at: new Date().toISOString(),
        is_me: true,
        image_url: null,
        pending: true,
      };
      queryClient.setQueryData(messagesQueryKey, (old: any[] | undefined) =>
        old ? [...old, optimistic] : [optimistic]
      );

      let error: any = null;
      if (selectedChat.type === 'dm') {
        ({ error } = await supabase.from('messages').insert({
          sender_id: user.id, receiver_id: selectedChat.partner_id, content: text
        }));
      } else if (selectedChat.type === 'service') {
        ({ error } = await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: selectedChat.partner_id,
          content: text,
          request_id: selectedChat.meta?.request_id
        }));
      } else if (selectedChat.type === 'community') {
        ({ error } = await supabase.from('community_messages').insert({
          community_id: selectedChat.id, sender_id: user.id, content: text
        }));
      } else {
        ({ error } = await supabase.from('event_chats').insert({
          event_id: selectedChat.id, user_id: user.id, message: text
        }));
      }

      if (error) {
        // Rollback the optimistic bubble and restore the unsent draft.
        queryClient.setQueryData(messagesQueryKey, (old: any[] | undefined) =>
          (old || []).filter((m: any) => m.id !== tempId)
        );
        setMessageInput((prev) => prev || text);
        throw error;
      }
      // Realtime INSERT will reconcile the temp bubble with the real row.
      refetchMessages();
    },
    onError: (err: any) => {
      if (err?.message === 'empty' || err?.message === 'not_ready') return;
      toast.error('Message failed to send');
    },
  });


  // --- 4b. SERVICE REQUEST MUTATIONS ---

  // Create a new service request (buyer initiates from map/profile)
  const createServiceRequest = useMutation({
    mutationFn: async ({
      seller_id, item_id, item_name, amount, description
    }: { seller_id: string; item_id: string; item_name: string; amount: number; description?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase.from('service_requests') as any).insert({
        buyer_id: user.id,
        seller_id,
        item_id,
        item_name,
        amount,
        description: description || '',
        status: 'pending',
        escrow_status: 'awaiting_payment',
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['service_list_chat', user?.id] });
      // Open the new service chat
      setSelectedChat({
        id: data.id,
        type: 'service',
        name: selectedChat?.name || 'Business',
        avatar: selectedChat?.avatar,
        partner_id: data.seller_id,
        is_verified: true,
        account_type: 'business',
        meta: {
          request_id: data.id,
          status: 'pending',
          amount: data.amount,
          item_name: data.item_name,
          is_buyer: true,
        }
      });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create request'),
  });

  // Accept a service request (seller accepts, moves to in_progress)
  const acceptServiceRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase.from('service_requests') as any)
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_list_chat', user?.id] });
      refetchMessages();
      toast.success('Request accepted — escrow is holding payment');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Mark as complete (seller) — releases escrow to seller
  const completeServiceRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase.from('service_requests') as any)
        .update({ status: 'completed', completed_at: new Date().toISOString(), escrow_status: 'released' })
        .eq('id', requestId);
      if (error) throw error;
      // TODO: trigger Flutterwave payout to seller via Supabase edge function
      await supabase.functions.invoke('release-escrow', { body: { request_id: requestId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_list_chat', user?.id] });
      refetchMessages();
      toast.success('Payment released to service provider 🎉');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Raise a dispute
  const disputeServiceRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase.from('service_requests') as any)
        .update({ status: 'disputed', disputed_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_list_chat', user?.id] });
      toast.warning('Dispute raised — our team will review within 24 hours');
    },
    onError: (err: any) => toast.error(err.message),
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
    <LaunchZoneGuard
      isLoading={locationLoading || launchZoneLoading}
      locationDetected={!!location}
      isWithinCity={isWithinCity}
      isInLaunchZone={isInLaunchZone}
      cityName={cityName}
      currentCount={currentCount || 0}
      targetCount={targetCount || 0} 
    >
      <div className="flex h-screen bg-background overflow-hidden">
        
        {/* LEFT SIDEBAR (Chat List) */}
        <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-muted/10 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between mb-4">
               <h1 className="text-xl font-bold">Messages in <span className="text-primary">{launchZoneLoading ? "Detecting..." : (cityName || "Nearby")}</span></h1>
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

          {/* TABS */}
          <div className="px-2 pt-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatType)} className="w-full">
              <TabsList className={`w-full bg-muted/50 p-1 rounded-xl grid ${myUserType === 'business' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <TabsTrigger value="dm" className="rounded-lg text-xs">Direct</TabsTrigger>
                <TabsTrigger value="community" className="rounded-lg text-xs">Community</TabsTrigger>
                <TabsTrigger value="event" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                   Vibes
                </TabsTrigger>
                <TabsTrigger value="service" className={`rounded-lg text-xs data-[state=active]:bg-cyan-500 data-[state=active]:text-white ${myUserType !== 'business' ? 'hidden' : ''}`}>
                  <Briefcase className="w-3 h-3 mr-1" />Services
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

            {activeTab === 'service' && serviceList.length > 0 ? (
              serviceList.map(chat => (
                <ChatListItem key={chat.id} chat={chat} isSelected={selectedChat?.id === chat.id} onClick={() => setSelectedChat(chat)} />
              ))
            ) : activeTab === 'service' && (
              <div className="p-8 text-center text-muted-foreground">
                <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No service requests yet</p>
                <p className="text-xs mt-1">Discover businesses on the map and tap "Message" to start a service request.</p>
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
          onAcceptRequest={(id) => acceptServiceRequest.mutate(id)}
          onCompleteRequest={(id) => completeServiceRequest.mutate(id)}
          onDisputeRequest={(id) => disputeServiceRequest.mutate(id)}
          isActionPending={acceptServiceRequest.isPending || completeServiceRequest.isPending || disputeServiceRequest.isPending}
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
    </LaunchZoneGuard>
  );
}

// --- ChatView ---
function ChatView({ selectedChat, setSelectedChat, messageInput, setMessageInput, sendMessage, messages, scrollRef, user, onAcceptRequest, onCompleteRequest, onDisputeRequest, isActionPending }: {
  selectedChat: ChatItem | null; setSelectedChat: (c: ChatItem | null) => void;
  messageInput: string; setMessageInput: (v: string) => void; sendMessage: any;
  messages: any[]; scrollRef: any; user: any;
  onAcceptRequest?: (id: string) => void;
  onCompleteRequest?: (id: string) => void;
  onDisputeRequest?: (id: string) => void;
  isActionPending?: boolean;
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
            {/* Find the header area and insert this below the title/status info */}
            {selectedChat.type === 'service' && selectedChat.is_verified && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-cyan-500" />
                <p className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">
                  Verified Business · Escrow Protected
                </p>
              </div>
            )}
            {selectedChat.type === 'dm' && selectedChat.account_type === 'business' && selectedChat.is_verified && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-primary" />
                <p className="text-[10px] text-primary/80 font-semibold">
                  Verified Business
                </p>
              </div>
            )}

           <p className="text-xs text-muted-foreground">
              {selectedChat.type === 'community' ? 'Community' : 'Online'}
           </p>
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
      {selectedChat.type === 'service'
        ? <ServiceChatInputArea
            selectedChat={selectedChat}
            messageInput={messageInput}
            setMessageInput={setMessageInput}
            sendMessage={sendMessage}
            onAccept={() => onAcceptRequest?.(selectedChat.meta?.request_id)}
            onComplete={() => onCompleteRequest?.(selectedChat.meta?.request_id)}
            onDispute={() => onDisputeRequest?.(selectedChat.meta?.request_id)}
            isActionPending={isActionPending}
            currentUserId={user?.id}
          />
        : <ChatInputArea selectedChat={selectedChat} messageInput={messageInput} setMessageInput={setMessageInput} sendMessage={sendMessage} />
      }

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
            className="flex-1 min-h-[36px] max-h-[100px] bg-transparent border-0 focus-visible:ring-0 resize-none py-2 text-sm"
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

// --- Service Chat Input Area (escrow lifecycle) ---
function ServiceChatInputArea({
  selectedChat, messageInput, setMessageInput, sendMessage,
  onAccept, onComplete, onDispute, isActionPending, currentUserId
}: {
  selectedChat: ChatItem; messageInput: string;
  setMessageInput: (v: string) => void; sendMessage: any;
  onAccept?: () => void; onComplete?: () => void; onDispute?: () => void;
  isActionPending?: boolean; currentUserId?: string;
}) {
  const meta = selectedChat.meta as any;
  const status: string = meta?.status || 'pending';
  const isBuyer: boolean = meta?.is_buyer ?? true;
  const amount: number = meta?.amount || 0;
  const requestId: string = meta?.request_id;

  const formatNGN = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

  // Escrow status banner
  const escrowBanner: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
    pending: {
      color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300',
      icon: <Clock className="w-4 h-4 shrink-0" />,
      text: isBuyer ? `Awaiting acceptance · ${formatNGN(amount)} held in escrow` : `New request · ${formatNGN(amount)} · Accept to begin`,
    },
    accepted: {
      color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300',
      icon: <Package className="w-4 h-4 shrink-0" />,
      text: `In progress · ${formatNGN(amount)} in escrow · Released on completion`,
    },
    in_progress: {
      color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300',
      icon: <Package className="w-4 h-4 shrink-0" />,
      text: `In progress · ${formatNGN(amount)} in escrow`,
    },
    completed: {
      color: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300',
      icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
      text: `Completed · ${formatNGN(amount)} released to provider`,
    },
    disputed: {
      color: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
      icon: <AlertCircle className="w-4 h-4 shrink-0" />,
      text: 'Dispute raised · Team reviewing within 24h · Funds frozen',
    },
    cancelled: {
      color: 'bg-muted border-border text-muted-foreground',
      icon: <X className="w-4 h-4 shrink-0" />,
      text: 'Request cancelled',
    },
  };

  const banner = escrowBanner[status] || escrowBanner.pending;
  const isDone = status === 'completed' || status === 'cancelled' || status === 'disputed';

  return (
    <div className="border-t bg-background space-y-0">
      {/* Escrow status banner */}
      <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs font-medium ${banner.color}`}>
        {banner.icon}
        <span className="flex-1">{banner.text}</span>
        {amount > 0 && !isDone && (
          <span className="flex items-center gap-1 font-bold">
            <CreditCard className="w-3 h-3" /> {formatNGN(amount)}
          </span>
        )}
      </div>

      {/* CTA action row — context-sensitive */}
      {!isDone && (
        <div className="px-4 py-2 flex gap-2 border-b">
          {/* SELLER: pending → Accept */}
          {!isBuyer && status === 'pending' && (
            <Button size="sm" className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white h-9 text-xs font-bold"
              onClick={onAccept} disabled={isActionPending}>
              {isActionPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Accept & Hold Escrow
            </Button>
          )}
          {/* SELLER: accepted/in_progress → Mark Complete (releases escrow) */}
          {!isBuyer && (status === 'accepted' || status === 'in_progress') && (
            <>
              <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600 text-white h-9 text-xs font-bold"
                onClick={onComplete} disabled={isActionPending}>
                {isActionPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Mark Complete
              </Button>
              <Button size="sm" variant="outline" className="h-9 text-xs text-destructive border-destructive/30"
                onClick={onDispute} disabled={isActionPending}>
                <AlertCircle className="w-3.5 h-3.5 mr-1" /> Dispute
              </Button>
            </>
          )}
          {/* BUYER: accepted/in_progress → Confirm + Dispute */}
          {isBuyer && (status === 'accepted' || status === 'in_progress') && (
            <>
              <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600 text-white h-9 text-xs font-bold"
                onClick={onComplete} disabled={isActionPending}>
                {isActionPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Confirm & Release Payment
              </Button>
              <Button size="sm" variant="outline" className="h-9 text-xs text-destructive border-destructive/30"
                onClick={onDispute} disabled={isActionPending}>
                <AlertCircle className="w-3.5 h-3.5 mr-1" /> Dispute
              </Button>
            </>
          )}
        </div>
      )}

      {/* Text input — available in all non-cancelled states */}
      {status !== 'cancelled' && (
        <div className="p-4">
          <div className="flex items-end gap-2 bg-muted/50 p-2 rounded-3xl border focus-within:border-primary/50 transition-colors">
            <Textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={isDone ? 'Chat closed' : `Message ${selectedChat.name}...`}
              disabled={isDone}
              className="flex-1 min-h-[40px] max-h-32 bg-transparent border-0 focus-visible:ring-0 resize-none py-2.5"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage.mutate();
                }
              }}
            />
            <Button size="icon" className="rounded-full h-10 w-10 shrink-0"
              disabled={!messageInput.trim() || isDone}
              onClick={() => sendMessage.mutate()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
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
        {/* --- INSERT THIS BLOCK --- */}
        {chat.is_verified && (
           <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
              <div className="bg-primary rounded-full p-0.5 text-white">
                <ShieldCheck className="w-3 h-3" />
              </div>
           </div>
        )}
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
            <PremiumBadge />
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
