import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireInterests?: boolean;
}

export const ProtectedRoute = ({
  children,
  requireInterests = true,
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/ahmia", { replace: true });
      return;
    }

    const checkOnboardingStatus = async () => {
      const currentPath = location.pathname.toLowerCase().replace(/\/$/, "");
      const isOnboardingPage = currentPath.includes("onboarding");
      const isAppPage = currentPath.includes("/app");

      // Already on onboarding — don't interfere
      if (isOnboardingPage) return;

      // Route doesn't need onboarding check
      if (!requireInterests) return;

      // Only guard /app/* routes
      if (!isAppPage) return;

      setIsChecking(true);

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("interests, skills, preferences, user_type")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Profile check error:", error);
          setIsChecking(false);
          return;
        }

        const prefs = (profile?.preferences || {}) as {
          discovery_radius?: number;
        };
        const hasRadius =
          typeof prefs.discovery_radius === "number" && prefs.discovery_radius > 0;

        const userType: string = profile?.user_type ?? "personal";

        // ── Onboarding completeness rules ───────────────────────────────────
        // personal: must have interests + discovery_radius
        // service:  must have skills (or interests as fallback) + discovery_radius
        //           — skips Vouch-it entirely; no extra check needed here
        // no user_type yet: treat as not started → send to onboarding
        // ────────────────────────────────────────────────────────────────────

        let onboardingComplete = false;

        if (userType === "personal") {
          const hasInterests =
            Array.isArray(profile?.interests) && profile!.interests.length > 0;
          onboardingComplete = hasInterests && hasRadius;
        } else if (userType === "service") {
          const hasSkills =
            Array.isArray((profile as any)?.skills) &&
            (profile as any).skills.length > 0;
          // Fallback: some early service signups may have written to interests
          const hasInterestsFallback =
            Array.isArray(profile?.interests) && profile!.interests.length > 0;
          onboardingComplete = (hasSkills || hasInterestsFallback) && hasRadius;
        }
        // If user_type is null/unknown they haven't picked a path yet → redirect

        if (!onboardingComplete) {
          console.log("Onboarding incomplete, redirecting…", {
            userType,
            onboardingComplete,
          });
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

  // Only block on initial auth load
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

  if (!user) return null;

  // Render immediately; interest/skill check redirects silently in background
  return <>{children}</>;
};
