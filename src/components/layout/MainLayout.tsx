import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Compass, Users, MapPin, MessageSquare, Calendar, Bell, ShieldCheck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { AdvertBanner } from '@/components/AdvertBanner';

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('discover');
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<any>(null); 
  const [notificationCount, setNotificationCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isPremium, setIsPremium] = useState(false); 

  // Global real-time notifications with toast alerts
  useRealtimeNotifications();

  // Navigation Configuration
  const tabs = [
    { id: 'discover', icon: Compass, label: 'Discover', path: '/app/feed' },
    { id: 'friends', icon: Users, label: 'Friends', path: '/app/friends' },
    { id: 'map', icon: MapPin, label: 'Map', path: '/app/map' },
    { id: 'messages', icon: MessageSquare, label: 'Chats', path: '/app/messages' },
    { id: 'events', icon: Calendar, label: 'Events', path: '/app/events' },
  ];

  useEffect(() => {
    const currentTab = tabs.find(tab => location.pathname.includes(tab.path));
    if (currentTab) setActiveTab(currentTab.id);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    // Get Profile
    supabase
      .from('profiles')
      .select('id, user_id, display_name, avatar_url, is_verified')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => setProfile(data));

    // Get Role
    supabase
      .from('user_roles')
      .select('id, user_id, role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => setUserRole(data)); 

    // Check premium_features table instead of subscriptions
    const checkPremiumStatus = async () => {
      // Check for active subscription OR manual premium feature
      const { data: premiumFeature } = await supabase
        .from('premium_features')
        .select('is_active, expires_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString()) // Ensure not expired
        .maybeSingle();

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      // User is premium if they have an active manual feature OR an active subscription
      const hasActiveFeature = !!premiumFeature;
      const hasActiveSub = sub?.status === 'active';
      
      setIsPremium(hasActiveFeature || hasActiveSub);
    };
    
    checkPremiumStatus();

    // Get Initial Unread Count (friend requests + event invitations)
    const fetchNotifications = async () => {
      const [friendRequestsResult, eventInvitesResult, unreadMessagesResult] = await Promise.all([
        supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .eq('addressee_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('event_invitations')
          .select('*', { count: 'exact', head: true })
          .eq('invitee_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('is_read', false)
      ]);
      
      const total = (friendRequestsResult.count || 0) + (eventInvitesResult.count || 0);
      setNotificationCount(total);
      setUnreadMessages(unreadMessagesResult.count || 0);
    };
    fetchNotifications();

    // Real-time subscription for friend requests
    const friendRequestsChannel = supabase
      .channel('notifications_friend_requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` },
        (payload) => {
          if (payload.new.status === 'pending') {
            setNotificationCount((prev) => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` },
        (payload) => {
          if (payload.old.status === 'pending' && payload.new.status !== 'pending') {
            setNotificationCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` },
        () => {
          setNotificationCount((prev) => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    // Real-time subscription for event invitations
    const eventInvitesChannel = supabase
      .channel('notifications_event_invites')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_invitations', filter: `invitee_id=eq.${user.id}` },
        (payload) => {
          if (payload.new.status === 'pending') {
            setNotificationCount((prev) => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_invitations', filter: `invitee_id=eq.${user.id}` },
        (payload) => {
          if (payload.old.status === 'pending' && payload.new.status !== 'pending') {
            setNotificationCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    // Real-time subscription for messages
    const messagesChannel = supabase
      .channel('messages_unread_count')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => {
          setUnreadMessages((prev) => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          if (payload.old.is_read === false && payload.new.is_read === true) {
            setUnreadMessages((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(friendRequestsChannel);
      supabase.removeChannel(eventInvitesChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 transition-all">
        <div className="container-mobile flex items-center justify-between py-3 px-4">
          
          {/* Profile Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/app/profile')}>
              <div className="relative">
                <Avatar className="w-9 h-9 border border-border group-hover:border-primary transition-colors">
                  <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    {profile?.display_name?.[0] || profile?.username?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full"></span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold leading-none group-hover:text-primary transition-colors">
                    {profile?.display_name || 'Welcome'}
                  </span>
                  {/* Verified Badge for Premium Users */}
                  {isPremium && (
                    <svg 
                      className="w-4 h-4 text-blue-500 flex-shrink-0" 
                      viewBox="0 0 22 22" 
                      fill="currentColor"
                      aria-label="Verified"
                    >
                      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">Online</span>
              </div>
            </div>

            {(userRole?.role === 'admin' || userRole?.role === 'super_admin') && (
              <Button 
                size="sm" 
                variant="destructive" 
                className="h-7 text-[10px] px-2 mr-0"
                onClick={() => navigate('/admin')}
              >
                <ShieldCheck className="w-3 h-3 mr-1" /> Admin
              </Button>
            )}
          </div>

          {/* Marketplace & Notification */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="relative hover:bg-muted/50 rounded-full h-10 w-10 group"
              onClick={() => navigate('/app/marketplace')}
            >
              {/* Store Icon with Hover Effect */}
              <Store className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              
              {/* Pulsating Hot Label */}
              <div className="absolute -top-0 -right-1 z-10">
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 px-1 bg-gradient-to-r from-orange-500 to-red-600 text-[8px] font-bold text-white items-center justify-center shadow-sm border border-white dark:border-background">
                    HOT
                  </span>
                </div>
              </div>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative hover:bg-muted/50 rounded-full h-10 w-10"
              onClick={() => {
                navigate('/app/notifications');
              }}
            >
              <Bell className="w-5 h-5 text-foreground/80" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold animate-pulse ring-2 ring-background px-1">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 overflow-x-hidden animate-in fade-in duration-300">
        <Outlet />
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-lg border-t border-border/50 pb-safe">
        <div className="container-mobile">
          <div className="flex items-center justify-between px-2 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const showBadge = tab.id === 'messages' && unreadMessages > 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); navigate(tab.path); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 w-16 py-2 rounded-2xl transition-all duration-200 active:scale-95",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  )}
                >
                  <div className={cn("relative p-1.5 rounded-xl transition-all", isActive && "bg-primary/10")}>
                    <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold px-1">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    <AdvertBanner />
    </div>
  );
};

export default MainLayout;
