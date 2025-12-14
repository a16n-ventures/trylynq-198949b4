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
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id) // Ensure this matches your DB column (user_id vs id)
          .maybeSingle();

        if (error) {
          console.error("Profile check error:", error);
          setIsChecking(false);
          return;
        }

        // Normalize path
        const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
        const isOnboardingPage = currentPath.includes('onboarding');

        // 3. Logic: If no interests, FORCE onboarding
        if (!profile?.interests || profile.interests.length === 0) {
          if (!isOnboardingPage) {
            console.log("Redirecting to onboarding...");
            navigate("/app/onboarding", { replace: true });
            // Don't set checking to false here, keep loading until redirect happens
            return; 
          }
        } 
        // 4. Logic: If interests EXIST but user is on onboarding page manually
        // You might want to let them stay there to edit, so we do nothing.
        
      } catch (err) {
        console.error("Unexpected route guard error:", err);
      } finally {
        // Only stop loading if we didn't trigger a redirect
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
