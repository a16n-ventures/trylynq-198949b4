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

// ─── State machine ────────────────────────────────────────────────────────────
//
//  PASS_THROUGH  → user is in an unlocked launch zone          → render children
//  LOADING       → waiting for GPS fix or DB response          → render children
//                  (LocationContext shows its own spinner if
//                   GPS is taking long; we just stay transparent)
//  NO_GPS        → GPS unavailable / denied                    → "Location Required"
//  WAITING_ROOM  → inside a city radius but zone locked        → "CITY LOADING..."
//  COMING_SOON   → outside every known launch zone             → "Coming Soon"
//
type GuardState = 'PASS_THROUGH' | 'LOADING' | 'NO_GPS' | 'WAITING_ROOM' | 'COMING_SOON';

function resolveState(
  isLoading: boolean,
  locationDetected: boolean,
  isWithinCity: boolean,
  isInLaunchZone: boolean | null,
): GuardState {
  // Still waiting for GPS or DB
  if (isLoading || isInLaunchZone === null) return 'LOADING';

  // Zone is unlocked — let the user in
  if (isInLaunchZone === true) return 'PASS_THROUGH';

  // GPS not available
  if (!locationDetected) return 'NO_GPS';

  // User is inside a registered city but it hasn't unlocked yet
  if (isWithinCity) return 'WAITING_ROOM';

  // User is outside every known city
  return 'COMING_SOON';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LaunchZoneGuard({
  isLoading,
  locationDetected,
  isWithinCity,
  isInLaunchZone,
  cityName,
  currentCount,
  targetCount,
  children,
}: LaunchZoneGuardProps) {
  const navigate = useNavigate();
  const state = resolveState(isLoading, locationDetected, isWithinCity, isInLaunchZone);

  // Transparent pass-through states
  if (state === 'PASS_THROUGH' || state === 'LOADING') return <>{children}</>;

  // ── Overlay content per state ──────────────────────────────────────────────
  const icon = {
    NO_GPS:       <MapPin  className="w-8 h-8 text-primary" />,
    WAITING_ROOM: <Lock    className="w-8 h-8 text-primary" />,
    COMING_SOON:  <Globe   className="w-8 h-8 text-primary" />,
  }[state];

  const title = {
    NO_GPS:       'Location Required',
    WAITING_ROOM: `${cityName?.toUpperCase() ?? 'YOUR CITY'} LOADING...`,
    COMING_SOON:  'Coming Soon',
  }[state];

  const subtitle = {
    NO_GPS:       'We need your location to show you what\'s nearby.',
    WAITING_ROOM: 'We are gathering pioneers! Help us reach our goal to unlock.',
    COMING_SOON:  "Ahmia hasn't landed in your city yet. We're expanding fast!",
  }[state];

  const buttonLabel =
    state === 'NO_GPS' ? 'Retry Detection' : (
      <>
        <UserPlus className="w-5 h-5 mr-2" />
        Invite to Speed Up
      </>
    );

  const handleButton = () => {
    if (state === 'NO_GPS') {
      window.location.reload();
    } else {
      navigate('/app/friends');
    }
  };

  const progress = targetCount > 0 ? Math.min(100, (currentCount / targetCount) * 100) : 0;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Blurred background — keeps app chrome visible but non-interactive */}
      <div className="blur-[2px] grayscale-[0.1] opacity-80 pointer-events-none select-none transition-all duration-700">
        {children}
      </div>

      {/* Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/40 backdrop-blur-[1px]">
        <div className="w-full max-w-md p-8 bg-card/90 backdrop-blur-md rounded-[2.5rem] border border-dashed border-primary/30 shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="text-center space-y-6">

            {/* Icon */}
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              {icon}
            </div>

            {/* Text */}
            <div className="space-y-1">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                {title}
              </h2>
              <p className="text-[11px] uppercase tracking-wider">
                {subtitle}
              </p>
              <small className="text-muted-foreground/60 italic">
                Social features are currently in "stealth mode"
              </small>
            </div>

            {/* Progress bar — only in WAITING_ROOM with a real target */}
            {state === 'WAITING_ROOM' && targetCount > 0 && (
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-end px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Progress
                  </span>
                  <span className="text-sm font-black italic">
                    {currentCount}{' '}
                    <span className="text-muted-foreground text-[10px] uppercase not-italic font-bold">
                      / {targetCount} Pioneers
                    </span>
                  </span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden border p-[2px]">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* CTA */}
            <Button
              className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white"
              onClick={handleButton}
            >
              {buttonLabel}
            </Button>

          </div>
        </div>
      </div>
    </div>
  );
}
