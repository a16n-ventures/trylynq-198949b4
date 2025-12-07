import { useEffect, useState } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext'; 
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { 
    if (authLoading) return;
    if (!loading && !user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

    const checkOnboardingStatus = async () => {
      try {
        // Check if user has completed interest selection
        const { data: profile } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .single();

        // If no interests found (or empty array), force onboarding
        // But allow access to the onboarding page itself to prevent loops
        if ((!profile?.interests || profile.interests.length === 0) && location.pathname !== '/onboarding') {
          navigate("/onboarding");
        }
      } catch (error) {
        console.error("Profile check failed", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};
