import React, { useRef, useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { 
  Search, Send, ArrowLeft, Plus, Users, 
  MessageSquare, Loader2, Calendar, Ticket,
  Globe, Shield, Settings, Info, MapPin, UserPlus
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useGeolocation } from '@/contexts/LocationContext';
import { useLaunchZone } from '@/hooks/useLaunchZone';

// Components
import { MessageBubble } from '@/components/messages/MessageBubble';
import { useScrollToBottom } from '@/hooks/useScrollToBottom';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { CommunitySettingsDialog } from '@/components/messages/CommunitySettingsDialog';
import { CommunityModerationDialog } from '@/components/messages/CommunityModerationDialog';

// --- TYPES ---
type ChatType = 'dm' | 'community' | 'event';
interface ChatItem {
  id: string;
  type: ChatType;
  name: string;
  avatar?: string;
  subtitle?: string;
  badge?: string | number;
  partner_id?: string;
  meta?: any;
}

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Location Logic (Adapted from Feed.tsx)
  const { location, isLoading: locationLoading } = useGeolocation();
  const [locationName, setLocationName] = useState("Detecting...");
  const { isInLaunchZone, cityName: launchCityName, isLoading: launchZoneLoading } = useLaunchZone(location?.latitude, location?.longitude);

  useEffect(() => {
    const fetchCityName = async () => {
      if (location?.latitude && location?.longitude) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`);
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.state || "Nearby";
          setLocationName(city);
        } catch (e) {
          setLocationName("Global Mode");
        }
      }
    };
    fetchCityName();
  }, [location?.latitude, location?.longitude]);

  // UI State
  const [activeTab, setActiveTab] = useState<ChatType>('dm');
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const cityNotDetected = !locationLoading && !launchZoneLoading && !location; 
  const showCityUnavailable = !locationLoading && !launchZoneLoading && isInLaunchZone === false;
  const isLocked = cityNotDetected || showCityUnavailable;

  // Hooks
  const { scrollRef, scrollToBottom } = useScrollToBottom([]);

  // --- DATA FETCHING ---
  const { data: dmList = [] } = useQuery({
    queryKey: ['dm_list', user?.id],
    queryFn: async () => {
      const { data: msgs } = await supabase.from('messages').select('*').or(`sender_id.eq.${user?.id},receiver_id.eq.${user?.id}`).order('created_at', { ascending: false });
      // ... (Logic to build unique partner list and fetch profiles would go here, simplified for refactor)
      return []; 
    },
    enabled: !!user && activeTab === 'dm'
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['messages', selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat) return [];
      const table = selectedChat.type === 'dm' ? 'messages' : selectedChat.type === 'community' ? 'community_messages' : 'event_chats';
      const { data } = await supabase.from(table).select('*').order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!selectedChat,
    refetchInterval: 3000
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!messageInput.trim() || !selectedChat) return;
      // Logic to insert into correct table based on selectedChat.type
      setMessageInput('');
      refetchMessages();
    }
  });

  useEffect(() => scrollToBottom(), [messages, scrollToBottom]);

  return (
    <div className="relative h-screen w-full bg-background overflow-hidden flex">
      
      {/* LAYER 1: CHAT CONTENT (Blurred if Locked) */}
      <div className={`flex flex-1 transition-all duration-700 ${isLocked ? 'blur-xl grayscale pointer-events-none opacity-40 select-none' : ''}`}>
        
        {/* LEFT SIDEBAR */}
        <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-muted/5 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b bg-background/50 backdrop-blur-md sticky top-0 z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Messages in {locationName}</h1>
              <Button size="icon" variant="ghost" className="rounded-full bg-primary/10 text-primary" onClick={() => {}}>
                <Plus className="w-5 h-5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search chats..." className="pl-9 bg-muted/50 border-0 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChatType)}>
              <TabsList className="w-full bg-muted/50 p-1 rounded-xl grid grid-cols-3">
                <TabsTrigger value="dm">Direct</TabsTrigger>
                <TabsTrigger value="community">Groups</TabsTrigger>
                <TabsTrigger value="event">Vibe Checks</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {/* Render Chat Items here */}
            {dmList.length === 0 && (
              <div className="text-center py-20 opacity-30">
                <MessageSquare className="w-12 h-12 mx-auto mb-2" />
                <p className="text-sm">No conversations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT CHAT VIEW */}
        <div className={`flex-1 flex flex-col bg-background ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
          {selectedChat ? (
            <>
              <div className="h-16 border-b flex items-center justify-between px-4 bg-background/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedChat(null)}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="h-10 w-10 border"><AvatarImage src={selectedChat.avatar} /><AvatarFallback>{selectedChat.name[0]}</AvatarFallback></Avatar>
                  <div>
                    <h2 className="font-bold text-sm">{selectedChat.name}</h2>
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest">{selectedChat.type}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((msg: any) => (
                  <MessageBubble key={msg.id} msg={msg} isMe={msg.sender_id === user?.id} />
                ))}
              </div>
              <div className="p-4 border-t">
                <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-2xl border">
                  <Input 
                    value={messageInput} 
                    onChange={(e) => setMessageInput(e.target.value)} 
                    placeholder="Message..." 
                    className="bg-transparent border-0 focus-visible:ring-0" 
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage.mutate()}
                  />
                  <Button size="icon" className="rounded-full h-10 w-10 shrink-0" onClick={() => sendMessage.mutate()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-20">
              <MessageSquare className="w-20 h-20 mb-4" />
              <h3 className="text-xl font-bold italic uppercase">Select a Vibe</h3>
            </div>
          )}
        </div>
      </div>

      {/* LAYER 2: CENTERED WAITING UI */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/20 backdrop-blur-md">
          <div className="w-full max-w-md p-8 bg-card rounded-[2.5rem] border border-dashed border-primary/30 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              {cityNotDetected ? <Globe className="w-8 h-8 text-primary" /> : <MessageSquare className="w-8 h-8 text-primary" />}
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                {cityNotDetected ? "GPS Required" : `${launchCityName || locationName} Loading...`}
              </h2>
              <p className="text-sm text-muted-foreground px-4">
                {cityNotDetected 
                  ? "We need your location to connect you with nearby vibes." 
                  : `Messaging is in Stealth Mode until we reach our Pioneer goal in ${launchCityName}.`}
              </p>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white" 
              onClick={() => cityNotDetected ? window.location.reload() : navigate('/app/friends')}
            >
              {cityNotDetected ? "Retry Detection" : <><UserPlus className="w-5 h-5 mr-2" /> Invite Pioneers</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
