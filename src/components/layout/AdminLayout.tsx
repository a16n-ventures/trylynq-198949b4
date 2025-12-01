import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Users, 
  ShieldAlert, 
  Calendar, 
  LogOut, 
  Menu,
  X,
  TrendingUp,
  Wallet,
  Settings
} from "lucide-react";
import { toast } from "sonner";

export default function AdminLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 1. Secure Check: Verify Role on Mount
  useEffect(() => {
    const checkRole = async () => {
      if (!user) return;
      
      // Replace in AdminLayout.tsx:
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });

      if (error || !data) {
        console.error("Role check failed", error);
        navigate('/app'); // Kick out
        return;
      }

      const role = data.role;
      if (role === 'admin' || role === 'super_admin') {
        setIsAdmin(true);
      } else {
        toast.error("Unauthorized access");
        navigate('/app'); // Kick out
      }
    };

    if (!loading) {
      if (!user) {
        navigate('/login');
      } else {
        checkRole();
      }
    }
  }, [user, loading, navigate]);

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Add this to your navItems array
  const navItems = [
    { label: 'Overview', path: '/admin', icon: LayoutDashboard },
    { label: 'Users', path: '/admin/users', icon: Users },
    { label: 'Events', path: '/admin/events', icon: Calendar },
    { label: 'Moderation', path: '/admin/moderation', icon: ShieldAlert },
    { label: 'Transactions', path: '/admin/finance', icon: TrendingUp },
    { label: 'Revenue', path: '/admin/revenue', icon: Wallet },
    { label: 'System & Billing', path: '/admin/settings', icon: Settings }, 
  ];


  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0
        `}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <h1 className="font-bold text-xl tracking-wider">LYNQ<span className="text-primary">ADMIN</span></h1>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-white" 
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors
                  ${isActive ? 'bg-primary text-white font-medium shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          <Button 
            variant="destructive" 
            className="w-full justify-start gap-3"
            onClick={() => navigate('/app')}
          >
            <LogOut className="w-4 h-4" />
            Exit Dashboard
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </Button>
          <span className="font-semibold">Dashboard</span>
          <div className="w-10" /> {/* Spacer */}
        </header>

        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
      
