import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext'; 
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireInterests?: boolean;
}

export const ProtectedRoute = ({ 
  children, 
  requireInterests = true 
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { 
    // Wait for auth to initialize
    if (authLoading) return;
    
    // Not logged in - redirect to home
    if (!user) {
      navigate('/', { replace: true });
      return;
    }

    const checkOnboardingStatus = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('interests')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error("Profile check error:", error);
          setIsChecking(false);
          return;
        }

        const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
        const isOnboardingPage = currentPath.includes('onboarding');

        // Only check interests if requireInterests is true
        if (requireInterests && (!profile?.interests || profile.interests.length === 0)) {
          if (!isOnboardingPage) {
            console.log("Redirecting to onboarding...");
            navigate("/onboarding", { replace: true });
            return; 
          }
        } 
      } catch (err) {
        console.error("Unexpected route guard error:", err);
      } finally {
        setIsChecking(false);
      }
    };
    
    checkOnboardingStatus();
  }, [user, authLoading, navigate, location.pathname, requireInterests]);

  // ✅ FIXED: Show loading only while actually checking
  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Setting up your experience...</p>
        </div>
      </div>
    );
  }

  // ✅ Safety check: Don't render if no user
  if (!user) return null;

  // ✅ Render children (the protected content)
  return <>{children}</>;
};
