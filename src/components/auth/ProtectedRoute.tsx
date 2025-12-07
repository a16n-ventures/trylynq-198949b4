import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext'; 
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { 
    // 1. Wait for Auth Context to initialize
    if (authLoading) return;

    // 2. If not logged in, redirect to home/login
    if (!user) {
      navigate('/', { replace: true });
      return;
    }

    // 3. If logged in, check Onboarding Status
    const checkOnboardingStatus = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .single();

        // If no interests found, force onboarding
        if ((!profile?.interests || profile.interests.length === 0) && location.pathname !== '/app/onboarding') {
          navigate("/app/onboarding");
        }
      } catch (error) {
        console.error("Profile check failed", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, navigate, location.pathname]);

  // Show loader while checking auth OR checking onboarding status
  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated (and effect hasn't redirected yet), don't render children
  if (!user) {
    return null;
  }

  return <>{children}</>;
};
