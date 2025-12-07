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
    // 1. Wait for Auth Context
    if (authLoading) return;

    // 2. If not logged in, redirect to home
    if (!user) {
      navigate('/', { replace: true });
      return;
    }

    // 3. Check Onboarding Status safely
    const checkOnboardingStatus = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .maybeSingle();

        // If DB error occurs, LOG it but DO NOT redirect (prevents infinite loop)
        if (error) {
          console.error("Profile check skipped due to error:", error);
          setIsChecking(false);
          return;
        }

        // Normalize path to avoid "/onboarding/" vs "/onboarding" mismatches
        const currentPath = location.pathname.replace(/\/$/, "");
        const isOnboarding = currentPath === '/app/onboarding';

        // Only force redirect if we are CERTAIN interests are missing
        if (profile && (!profile.interests || profile.interests.length === 0) && !isOnboarding) {
          console.log("Missing interests, redirecting to onboarding");
          navigate("/app/onboarding");
        }
      } catch (err) {
        console.error("Unexpected route guard error:", err);
      } finally {
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, navigate, location.pathname]);

  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, don't render children
  if (!user) return null;

  return <>{children}</>;
};
