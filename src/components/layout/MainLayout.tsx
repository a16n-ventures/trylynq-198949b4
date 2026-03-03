import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Compass, Map as MapIcon, MessageCircle, User, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('discover');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Global notifications (Toast only, no visual bell in layout)
  useRealtimeNotifications(user?.id);

  // Fetch system flags from admin settings
  const { data: systemFlags } = useQuery({
    queryKey: ['system-flags'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'system_flags').maybeSingle();
      return data?.value as { maintenance_mode?: boolean } | null;
    },
    staleTime: 60000,
  });

  // Navigation Configuration - The Clyx 4-Pillar Structure
  const tabs = [
    { id: 'discover', icon: Compass, label: 'Discover', path: '/app/feed' },
    { id: 'map', icon: MapIcon, label: 'Map', path: '/app/map' },
    { id: 'vibes', icon: MessageCircle, label: 'Vibes', path: '/app/messages' },
    { id: 'profile', icon: User, label: 'Me', path: '/app/profile' },
  ];

  // Sync active tab with URL
  useEffect(() => {
    const currentTab = tabs.find(tab => location.pathname.includes(tab.path));
    if (currentTab) setActiveTab(currentTab.id);
  }, [location.pathname]);

  // Fetch minimal data needed for the layout (Avatar + Unreads)
  useEffect(() => {
    if (!user) return;

    supabase.from('profiles').select('avatar_url').eq('user_id', user.id).single()
      .then(({ data }) => setUserAvatar(data?.avatar_url));

    supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id).eq('is_read', false)
      .then(({ count }) => setUnreadMessages(count || 0));

    const channel = supabase.channel('layout_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, 
        () => {
          supabase.from('messages').select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id).eq('is_read', false)
            .then(({ count }) => setUnreadMessages(count || 0));
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Maintenance Mode Banner
  if (systemFlags?.maintenance_mode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold">We'll be right back</h1>
          <p className="text-muted-foreground">Ahmia is currently undergoing maintenance. Please check back shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
      
      <main className="flex-1 pb-24 overflow-x-hidden animate-in fade-in duration-300">
        <Outlet />
      </main>

      {/* 2. FLOATING GLASS DOCK (The Clyx Nav) */}
      <div className="fixed bottom-6 left-4 right-4 z-50">
        <div className="container-mobile max-w-md mx-auto">
          <div className="flex items-center justify-between bg-background/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-3xl px-2 py-2">
            
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isProfile = tab.id === 'profile';
              
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); navigate(tab.path); }}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-14 rounded-2xl transition-all duration-300 ease-out",
                    isActive ? "bg-primary/10" : "hover:bg-muted/30"
                  )}
                >
                  <div className="relative">
                    {/* Special Case: Profile Tab uses User Avatar */}
                    {isProfile ? (
                      <div className={cn("p-0.5 rounded-full transition-all", isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "")}>
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={userAvatar || undefined} />
                          <AvatarFallback className="text-[9px]">ME</AvatarFallback>
                        </Avatar>
                      </div>
                    ) : (
                      <Icon 
                        className={cn(
                          "w-6 h-6 transition-all duration-300", 
                          isActive ? "text-primary fill-primary/20 scale-110" : "text-muted-foreground"
                        )} 
                        strokeWidth={isActive ? 2.5 : 2} 
                      />
                    )}

                    {/* Unread Badge */}
                    {tab.id === 'vibes' && unreadMessages > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold border-2 border-background animate-pulse">
                        {unreadMessages > 99 ? '99' : unreadMessages}
                      </span>
                    )}
                  </div>
                  
                  {/* Label (Only visible when active for cleaner look, or always subtle) */}
                  {/* Clyx often hides labels, but we'll keep them subtle */}
                  <span className={cn(
                    "text-[10px] font-medium mt-1 transition-all",
                    isActive ? "text-primary translate-y-0 opacity-100" : "text-muted-foreground translate-y-1 opacity-0 hidden"
                  )}>
                    {tab.label}
                  </span>
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
