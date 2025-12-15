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
    // 2. If not logged in, redirect to home immediately
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    const checkOnboardingStatus = async () => {
      try {
        // FIXED: Changed .eq('user_id', ...) to .eq('id', ...)
        // This must match the column used in InterestSelector.tsx
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id) 
          .maybeSingle();
        if (error) {
          console.error("Profile check error:", error);
          // If error, assume valid to prevent loop, let the app handle data missing later
          setIsChecking(false);
          return;
        }
        const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
        const isOnboardingPage = currentPath.includes('onboarding');
        // Check if interests exist
        if (!profile?.interests || profile.interests.length === 0) {
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
  }, [user, authLoading, navigate, location.pathname]);

  // Show loader while checking auth OR checking profile status
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

  // If user is not authenticated (safety fallback), don't render children
  if (!user) return null;

  return <>{children}</>;
};
