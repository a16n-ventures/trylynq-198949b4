import { Button } from '@/components/ui/button';
import { Lock, MapPin, Globe, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LaunchZoneGuardProps {
  isLoading: boolean;
  locationDetected: boolean;
  isWithinCity: boolean;
  isInLaunchZone: boolean | null;
  cityName: string | null;
  currentCount: number;
  targetCount: number;
  children: React.ReactNode;
}

export function LaunchZoneGuard({
  isLoading, locationDetected, isWithinCity, isInLaunchZone, 
  cityName, currentCount, targetCount, children 
}: LaunchZoneGuardProps) {
  const navigate = useNavigate();

  if (isLoading || isInLaunchZone === true) return <>{children}</>;

  const noGps = !locationDetected;
  const waitingRoom = !noGps && isWithinCity && !isInLaunchZone;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="blur-[2px] grayscale-[0.1] opacity-80 pointer-events-none select-none transition-all duration-700">
        {children}
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/40 backdrop-blur-[1px]">
        <div className="w-full max-w-md p-8 bg-card/90 backdrop-blur-md rounded-[2.5rem] border border-dashed border-primary/30 shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              {noGps ? <MapPin className="text-primary" /> : waitingRoom ? <Lock className="text-primary" /> : <Globe className="text-primary" />}
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                {noGps ? "Location Required" : waitingRoom ? `${cityName?.toUpperCase() || 'CITY'} LOADING...` : "COMING SOON"}
              </h2>
              <p className="text-[11px] text-muted-foreground/60 italic uppercase tracking-wider">Social Stealth Mode Active</p>
            </div>

            {waitingRoom && (
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-end px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Progress</span>
                  <span className="text-sm font-black italic">{currentCount} <span className="text-muted-foreground text-[10px] uppercase not-italic font-bold">/ {targetCount} Pioneers</span></span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden border p-[2px]">
                  <div className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (currentCount / targetCount) * 100)}%` }} />
                </div>
              </div>
            )}

            <Button className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white" onClick={() => noGps ? window.location.reload() : navigate('/app/friends')}>
              {noGps ? "Retry Detection" : <><UserPlus className="w-5 h-5 mr-2" /> Invite to Speed Up</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
