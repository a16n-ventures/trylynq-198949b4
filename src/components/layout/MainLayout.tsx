import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Compass, Users, MapPin, MessageSquare, Calendar, Bell, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('discover');
  const [profile, setProfile] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  // Navigation Configuration
  const tabs = [
    { id: 'discover', icon: Compass, label: 'Discover', path: '/app/discover' },
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

    // Get Profile AND Role
    supabase
      .from('profiles')
      .select('id, user_id, display_name, avatar_url, role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => setProfile(data));

    // Get Initial Unread Count (friend requests + event invitations)
    const fetchNotifications = async () => {
      const [friendRequestsResult, eventInvitesResult] = await Promise.all([
        supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .eq('addressee_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('event_invitations')
          .select('*', { count: 'exact', head: true })
          .eq('invitee_id', user.id)
          .eq('status', 'pending')
      ]);
      
      const total = (friendRequestsResult.count || 0) + (eventInvitesResult.count || 0);
      setNotificationCount(total);
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
          // If request was accepted/declined, decrement count
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

    return () => {
      supabase.removeChannel(friendRequestsChannel);
      supabase.removeChannel(eventInvitesChannel);
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
                    {profile?.display_name?.[0] || user?.email?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full"></span>
              </div>
              <div className="flex flex-col">
                 <span className="text-sm font-bold leading-none group-hover:text-primary transition-colors">
                   {profile?.display_name || 'Welcome'}
                 </span>
                 <span className="text-[10px] text-muted-foreground">Online</span>
              </div>
            </div>

            {/* ADMIN BUTTON (Only visible to Admins) */}
            {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
              <Button 
                size="sm" 
                variant="destructive" 
                className="h-7 text-[10px] px-2 ml-2"
                onClick={() => navigate('/admin')}
              >
                <ShieldCheck className="w-3 h-3 mr-1" /> Admin
              </Button>
            )}
          </div>

          {/* Notification Bell */}
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
                  </div>
                  <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
