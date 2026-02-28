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
  const [isChecking, setIsChecking] = useState(false);
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
      const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
      const isOnboardingPage = currentPath.includes('onboarding');
      const isAppPage = currentPath.includes('/app');

      // ✅ CRITICAL: Skip check entirely if already on onboarding page
      if (isOnboardingPage) {
        return;
      }

      // ✅ Skip check if route doesn't require interests
      if (!requireInterests) {
        return;
      }

      // ✅ ONLY check interests for app pages (silently redirect, no loader)
      if (!isAppPage) {
        return;
      }

      setIsChecking(true);

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

        // Check if interests are missing
        const hasInterests = profile?.interests && 
                            Array.isArray(profile.interests) && 
                            profile.interests.length > 0;

        if (!hasInterests) {
          console.log("No interests found, redirecting to onboarding...");
          // Silently redirect - NO LOADER
          navigate("/onboarding", { replace: true });
          return;
        }
      } catch (err) {
        console.error("Unexpected route guard error:", err);
      } finally {
        setIsChecking(false);
      }
    };
    
    checkOnboardingStatus();
  }, [user, authLoading, navigate, location.pathname, requireInterests]);

  // ✅ ONLY show loading during initial auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ✅ REMOVED: No "Setting up your experience" loader anywhere
  // The redirect happens silently in the background

  // ✅ Safety check: Don't render if no user
  if (!user) return null;

  // ✅ Render children immediately (even during interest check - it redirects silently)
  return <>{children}</>;
};

// ============================================================================
// WHAT CHANGED - CRITICAL FIX
// ============================================================================

/**
 * ❌ OLD BEHAVIOR (WRONG):
 * - Shows "Setting up your experience..." loader on /app pages
 * - Blocks user from seeing content while checking interests
 * 
 * ✅ NEW BEHAVIOR (CORRECT):
 * - NO loader on app pages
 * - NO loader on onboarding page
 * - Silently redirects from /app → /onboarding if no interests
 * - Only shows loader during initial authentication
 * 
 * REMOVED THIS ENTIRE BLOCK:
 * ```
 * if (isChecking && isAppPage && requireInterests) {
 *   return <div>"Setting up your experience..."</div>
 * }
 * ```
 * 
 * NOW:
 * - User goes to /app/discover
 * - Route guard checks interests in background
 * - If no interests → navigate("/onboarding") happens silently
 * - User sees nothing (instant redirect)
 * - Onboarding page loads normally without any loader
 */

// ============================================================================
// IF YOU WANT A LOADER, IT SHOULD BE IN THE ONBOARDING COMPONENT ITSELF
// ============================================================================

/**
 * If you want "Setting up your experience" to show anywhere,
 * put it in your Onboarding.tsx component while interests are being saved:
 * 
 * const [isSaving, setIsSaving] = useState(false);
 * 
 * const handleComplete = async () => {
 *   setIsSaving(true);
 *   // Save interests...
 *   setIsSaving(false);
 *   navigate('/app/discover');
 * };
 * 
 * if (isSaving) {
 *   return <div>"Setting up your experience..."</div>
 * }
 */
