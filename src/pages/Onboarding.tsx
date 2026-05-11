import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InterestSelector } from "@/components/onboarding/InterestSelector";
import { SkillSelector } from "@/components/onboarding/SkillSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Briefcase, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type UserPath = "personal" | "business" | null;

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userPath, setUserPath] = useState<UserPath>(null);
  const [savingPath, setSavingPath] = useState(false);

  // Apply pending referral code after signup
  useEffect(() => {
    const applyReferral = async () => {
      if (!user?.id) return;
      const code = localStorage.getItem("pending_referral_code");
      if (!code) return;

      try {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("referral_code", code.toUpperCase())
          .single();

        if (referrer && referrer.user_id !== user.id) {
          const { data: existing } = await supabase
            .from("referrals")
            .select("id")
            .eq("referred_id", user.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from("referrals").insert({
              referrer_id: referrer.user_id,
              referred_id: user.id,
              referral_code: code.toUpperCase(),
              status: "completed",
              completed_at: new Date().toISOString(),
            });
            toast.success("Referral code applied! 🎉");
          }
        }
      } catch (e) {
        console.error("Referral apply error:", e);
      } finally {
        localStorage.removeItem("pending_referral_code");
      }
    };

    applyReferral();
  }, [user?.id]);

  // Persist the chosen path to the profile so ProtectedRoute / downstream
  // surfaces can branch on user_type without re-asking.
  const handlePathSelection = async (path: UserPath) => {
    if (!path || !user?.id) return;

    setSavingPath(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            user_type: path, // "personal" | "business"
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      setUserPath(path);
    } catch (err: any) {
      toast.error(`Could not save account type: ${err.message}`);
    } finally {
      setSavingPath(false);
    }
  };

  const handleComplete = () => {
    navigate("/app/feed", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Back button — only show on path-selection screen */}
      {!userPath && (
        <Button
          variant="ghost"
          className="absolute top-4 left-4 z-10"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      )}

      {/* Back to path selection when inside a selector */}
      {userPath && (
        <Button
          variant="ghost"
          className="absolute top-4 left-4 z-10"
          onClick={() => setUserPath(null)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      )}

      <Card className="w-full max-w-lg shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl animate-in zoom-in-95 duration-300">
        <CardContent className="p-0">
          {/* ── Step 0: Path selection ─────────────────────────────────── */}
          {!userPath && (
            <PathSelection onSelect={handlePathSelection} loading={savingPath} />
          )}

          {/* ── Step 1a: Personal → generic interest selector ─────────── */}
          {userPath === "personal" && (
            <InterestSelector onComplete={handleComplete} />
          )}

          {/* ── Step 1b: business → trade/skill selector ───────────────── */}
          {userPath === "business" && (
            <SkillSelector onComplete={handleComplete} />
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground text-center max-w-sm">
        Your choices define your experience. You can change these later in
        Settings.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PathSelection — inline sub-component (no extra file needed)
// ─────────────────────────────────────────────────────────────────────────────

interface PathSelectionProps {
  onSelect: (path: UserPath) => void;
  loading: boolean;
}

function PathSelection({ onSelect, loading }: PathSelectionProps) {
  return (
    <div className="flex flex-col h-full max-w-md mx-auto p-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center mb-8 space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          How will you use the app?
        </h2>
        <p className="text-muted-foreground text-sm">
          Choose the account type that best fits you. This shapes your entire
          experience.
        </p>
      </div>

      <div className="grid gap-4">
        {/* Personal path */}
        <button
          onClick={() => onSelect("personal")}
          disabled={loading}
          className="group relative flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <User className="h-6 w-6" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-semibold leading-none">Personal</p>
            <p className="text-sm text-muted-foreground">
              Discover events, connect with people, and explore what's happening
              around you.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </button>

        {/* business path */}
        <button
          onClick={() => onSelect("business")}
          disabled={loading}
          className="group relative flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 transition-colors group-hover:bg-blue-500/20">
            <Briefcase className="h-6 w-6" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-semibold leading-none">Business</p>
            <p className="text-sm text-muted-foreground">
              Offer a skill or trade — get discovered by people who need what
              you do.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </button>
      </div>

      {loading && (
        <p className="mt-6 text-center text-sm text-muted-foreground animate-pulse">
          Saving your choice…
        </p>
      )}
    </div>
  );
}
