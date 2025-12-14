import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Curated list of high-level categories for better AI matching
const INTEREST_TAGS = [
  "Tech & Coding", "Business & Startups", "Music & Concerts", 
  "Art & Culture", "Food & Drink", "Nightlife", "Networking",
  "Health & Wellness", "Sports & Fitness", "Travel & Outdoor",
  "Gaming", "Photography", "Fashion", "Film & Cinema",
  "Education", "Spirituality", "Volunteering", "Comedy"
];

interface InterestSelectorProps {
  onComplete: () => void;
  initialSelected?: string[];
}

export function InterestSelector({ onComplete, initialSelected = [] }: InterestSelectorProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interest: string) => {
    setSelected(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const saveInterests = async () => {
    if (!user) {
      toast.error("No user found. Please try logging in again.");
      return;
    }
    if (selected.length < 3) {
      toast.error("Please select at least 3 interests.");
      return;
    }

    setLoading(true);
    try {
      // CHANGED: Use .upsert() instead of .update()
      // This creates the row if it's missing (fixing broken signups)
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ 
          user_id: user.id,
          interests: selected,
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'user_id' // Ensure we don't create duplicates
        })
       .select();

      if (error) {
        console.error("Supabase Update Error:", error.message, error.details);
        throw new Error(error.message);
      }

      // If no data returned, RLS likely silently blocked the update
      if (!data || data.length === 0) {
        console.error("Update failed: No rows returned. Check RLS policies.");
        throw new Error("Update blocked by security policy.");
      }

      console.log("Save successful:", data);

      // 2. Optional: Trigger AI (wrapped in try/catch so it doesn't block the main flow)
      try {
        await supabase.functions.invoke('generate-user-embedding', {
          body: { user_id: user.id, interests: selected }
        });
      } catch (aiError) {
        console.warn("AI embedding generation failed, but interests saved:", aiError);
      }

      toast.success("Profile updated!");
      
      // Force a hard navigation to clear any cached states in ProtectedRoute
      window.location.href = '/app/discover'; 
      
    } catch (err: any) {
      console.error("Full Error Object:", err);
      toast.error(`Failed to save: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto p-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center mb-6 space-y-2">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">What are you into?</h2>
        <p className="text-muted-foreground">
          Select at least 3 topics. We use these to tailor your event feed and friend suggestions.
        </p>
      </div>

      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="flex flex-wrap gap-2 justify-center py-4">
          {INTEREST_TAGS.map((tag) => {
            const isSelected = selected.includes(tag);
            return (
              <Badge
                key={tag}
                variant={isSelected ? "default" : "outline"}
                className={`
                  px-4 py-2 text-sm cursor-pointer transition-all duration-200 select-none
                  ${isSelected 
                    ? "bg-primary hover:bg-primary/90 shadow-md scale-105" 
                    : "hover:bg-accent hover:border-primary/50"
                  }
                `}
                onClick={() => toggleInterest(tag)}
              >
                {tag}
                {isSelected && <Check className="w-3 h-3 ml-2" />}
              </Badge>
            );
          })}
        </div>
      </ScrollArea>

      <div className="mt-6 pt-4 border-t">
        <div className="flex justify-between items-center text-sm text-muted-foreground mb-4">
          <span>{selected.length} selected</span>
          <span>Min. 3</span>
        </div>
        <Button 
          className="w-full gradient-primary text-white shadow-lg h-12 text-lg" 
          onClick={saveInterests}
          disabled={loading || selected.length < 3}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Personalizing...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  );
}
