import { useNavigate } from "react-router-dom";
import { InterestSelector } from "@/components/onboarding/InterestSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Back button (optional, in case they want to skip for now) */}
      <Button 
        variant="ghost" 
        className="absolute top-4 left-4 z-10" 
        onClick={() => navigate('/')}
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <Card className="w-full max-w-lg shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl animate-in zoom-in-95 duration-300">
        <CardContent className="p-0">
          <InterestSelector 
            onComplete={() => {
              // Redirect to the Discover page with the 'foryou' tab active
              navigate('/app/socialfeed', { replace: true});
            }}
          />
        </CardContent>
      </Card>
      
      <p className="mt-6 text-xs text-muted-foreground text-center max-w-sm">
        Your choices define your experience. You can change these later in Settings.
      </p>
    </div>
  );
}
