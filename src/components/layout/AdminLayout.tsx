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
  Settings,
  ShoppingBasket
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
      
      try {
        // First check if user is a super_admin using RPC
        const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc('has_role', { 
          _user_id: user.id, 
          _role: 'super_admin' 
        });

        if (!superAdminError && isSuperAdmin) {
          setIsAdmin(true);
          return;
        }
        
        // Also check for regular admin role
        const { data: hasAdminRole, error: adminError } = await supabase.rpc('has_role', { 
          _user_id: user.id, 
          _role: 'admin' 
        });

        if (!adminError && hasAdminRole) {
          setIsAdmin(true);
          return;
        }

        // If not admin, check if ANY super_admins exist in the system
        const { count: superAdminCount, error: superCountError } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'super_admin');
        
        // If no super_admins exist, bootstrap first super_admin
        if (!superCountError && superAdminCount === 0) {
          toast.info("No super admin found. Setting up admin access...");
          
          // Insert super_admin role directly
          const { error: insertError } = await supabase
            .from('user_roles')
            .insert({ user_id: user.id, role: 'super_admin' });
          
          if (!insertError) {
            toast.success("You are now a super admin!");
            setIsAdmin(true);
            return;
          } else {
            console.error("Failed to make super admin:", insertError);
            toast.error("Failed to set up admin access");
            navigate('/app');
            return;
          }
        }
        
        // Admins exist but user is not one of them
        toast.error("Unauthorized access - Admin role required");
        navigate('/app');
        
      } catch (err) {
        console.error("Role check error", err);
        toast.error("Failed to verify admin access");
        navigate('/app');
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
    { label: 'Marketplace', path: '/admin/marketplace', icon: ShoppingBasket },
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
          <h1 className="font-bold text-xl tracking-wider">AHMIA<span className="text-primary">ADMIN</span></h1>
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
      
