import { Button } from '@/components/ui/button';
import { Lock, MapPin, Globe, UserPlus, Bell, CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useGeolocation } from '@/contexts/LocationContext'; 
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Reverse-geocodes coords → real city name, fully self-contained
function useResolvedCityName(): string {
  const { location } = useGeolocation();
  const [resolvedCity, setResolvedCity] = useState('');

  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return;
    let cancelled = false;
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`,
      { headers: { 'User-Agent': 'Ahmia-App-Production' } }
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setResolvedCity(
          data?.address?.city ||
          data?.address?.town  ||
          data?.address?.county ||
          data?.address?.state  ||
          ''
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [location?.latitude, location?.longitude]);

  return resolvedCity;
} 

// ─── Live Zone Counts Hook ─────────────────────────────────────────────────────
// Fetches current/target counts from `launch_zones` and subscribes to
// Realtime changes on the `waitlist` table so the progress bar updates live
// for every user watching — no refresh needed.
function useLiveZoneCounts(
  cityName: string,
  propCurrentCount: number,
  propTargetCount: number,
) {
  const [counts, setCounts] = useState({
    current: propCurrentCount,
    target:  propTargetCount,
  });

  // Sync if parent props change (e.g. initial server-side value arrives)
  useEffect(() => {
    setCounts({ current: propCurrentCount, target: propTargetCount });
  }, [propCurrentCount, propTargetCount]);

  useEffect(() => {
    if (!cityName) return;

    // Initial fetch from launch_zones
    supabase
      .from('launch_zones')
      .select('current_count, target_count')
      .eq('city', cityName)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCounts({ current: data.current_count, target: data.target_count });
      });

    // Realtime — re-fetch counts whenever a waitlist row for this city changes
    const channel = supabase
      .channel(`zone-counts-${cityName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waitlist', filter: `city=eq.${cityName}` },
        () => {
          supabase
            .from('launch_zones')
            .select('current_count, target_count')
            .eq('city', cityName)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setCounts({ current: data.current_count, target: data.target_count });
            });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cityName]);

  // Optimistic helpers — called by useWaitlist on join attempt
  const increment = useCallback(() => setCounts(c => ({ ...c, current: c.current + 1 })), []);
  const decrement = useCallback(() => setCounts(c => ({ ...c, current: Math.max(0, c.current - 1) })), []);

  return { counts, increment, decrement };
}

// ─── Animated Count Hook ───────────────────────────────────────────────────────
// Smoothly ticks the displayed number up when `target` increases,
// so Realtime updates feel alive rather than snapping.
function useAnimatedCount(target: number): number {
  const [display, setDisplay] = useState(target);
  const ref = useRef(target);

  useEffect(() => {
    const diff = target - ref.current;
    if (diff <= 0) {
      setDisplay(target);
      ref.current = target;
      return;
    }

    // Tick up over ~800 ms
    const steps    = Math.min(diff, 20);
    const interval = 800 / steps;
    let   step     = 0;

    const id = setInterval(() => {
      step++;
      setDisplay(Math.round(ref.current + (diff * step) / steps));
      if (step >= steps) {
        clearInterval(id);
        ref.current = target;
      }
    }, interval);

    return () => clearInterval(id);
  }, [target]);

  return display;
}

// ─── Waitlist Hook ─────────────────────────────────────────────────────────────
// No form needed — auto-captures logged-in user's profile data.
// Saves to `waitlist` table + inserts an `admin_notifications` row.
// Accepts optimistic increment/decrement callbacks from useLiveZoneCounts
// so the progress bar reacts instantly on join, with rollback on error.
function useWaitlist(
  cityName: string,
  onOptimisticIncrement: () => void,
  onOptimisticDecrement: () => void,
) {
  const { user } = useAuth();
  const { location } = useGeolocation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'joined'>('idle');

  // On mount: check if this user already joined so button shows correct state
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('waitlist')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setStatus('joined'); });
  }, [user?.id]);

  const joinWaitlist = useCallback(async () => {
    if (!user?.id || status !== 'idle') return;
    setStatus('loading');
    onOptimisticIncrement(); // update count immediately — don't wait for DB

    try {
      // Auto-capture name from profile — no form needed
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('user_id', user.id)
        .maybeSingle();

      const displayName = profile?.display_name || profile?.username || user.email || 'Unknown';

      const payload = {
        user_id:   user.id,
        email:     user.email ?? null,
        full_name: displayName,
        city:      cityName || 'Unknown',
        latitude:  location?.latitude  ?? null,
        longitude: location?.longitude ?? null,
        joined_at: new Date().toISOString(),
      };

      // 1. Save to waitlist (upsert = safe if user taps twice)
      const { error } = await supabase
        .from('waitlist')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

      // 2. Notify admin via admin_notifications table
      await supabase.from('admin_notifications').insert({
        type:    'waitlist_signup',
        title:   `New waitlist signup — ${cityName || 'Unknown City'}`,
        body:    `${displayName} (${user.email}) wants Ahmia in ${cityName}.`,
        meta:    payload,
        is_read: false,
      });

      setStatus('joined');
      toast.success("You're on the list! We'll notify you when Ahmia lands.");
    } catch (err: any) {
      console.error('[Waitlist]', err);
      toast.error("Couldn't join — please try again.");
      onOptimisticDecrement(); // roll back the optimistic increment
      setStatus('idle');
    }
  }, [user, location, cityName, status, onOptimisticIncrement, onOptimisticDecrement]);

  return { status, joinWaitlist };
}

interface LaunchZoneGuardProps {
  isLoading: boolean;
  locationDetected: boolean;
  isWithinCity: boolean;
  isInLaunchZone: boolean | null;
  cityName: string | null;
  currentCount: number;
  targetCount: number;
  onZoneUnlocked?: () => void;
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
  onZoneUnlocked,
  children,
}: LaunchZoneGuardProps) {
  const navigate = useNavigate();
  const resolvedCityName = useResolvedCityName();
  const state = resolveState(isLoading, locationDetected, isWithinCity, isInLaunchZone); 
  
  // DB milestone name takes priority, then live geocode, then generic fallback
  const bestCityName = (cityName || resolvedCityName || 'YOUR CITY').toUpperCase();

  // Live counts — subscribes to Realtime; falls back to prop values until connected
  const { counts, increment, decrement } = useLiveZoneCounts(
    cityName || resolvedCityName,
    currentCount,
    targetCount,
  );

  // Animated display value — smoothly ticks up when Realtime pushes a new count
  const animatedCount = useAnimatedCount(counts.current);

  // Waitlist hook — only meaningful in COMING_SOON but safe to always call (hook rules)
  const { status: waitlistStatus, joinWaitlist } = useWaitlist(
    cityName || resolvedCityName,
    increment,
    decrement,
  );

  // ── Zone unlock subscription ───────────────────────────────────────────────
  // Listens for `launch_zones` UPDATE so the guard auto-transitions when the
  // zone flips to unlocked — no manual refresh needed.
  useEffect(() => {
    const city = cityName || resolvedCityName;
    if (!city) return;

    const channel = supabase
      .channel(`zone-unlock-${city}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'launch_zones',
          filter: `city=eq.${city}`,
        },
        (payload) => {
          if (payload.new.is_unlocked === true) {
            if (onZoneUnlocked) {
              onZoneUnlocked();
            } else {
              // Fallback: hard reload if parent hasn't wired up a callback
              window.location.reload();
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cityName, resolvedCityName, onZoneUnlocked]);

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
    WAITING_ROOM: `${bestCityName} LOADING...`,
    COMING_SOON:  `${bestCityName} — COMING SOON`,
  }[state];

  const subtitle = {
    NO_GPS:       'We need your location to show you what\'s nearby.',
    WAITING_ROOM: 'We are gathering pioneers! Help us reach our goal to unlock.',
    COMING_SOON:  "Ahmia hasn't landed in your city yet. We're expanding fast!",
  }[state];

  const progress = counts.target > 0 ? Math.min(100, (counts.current / counts.target) * 100) : 0;

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
            {state === 'WAITING_ROOM' && counts.target > 0 && (
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-end px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Progress
                  </span>
                  <span className="text-sm font-black italic">
                    {animatedCount}{' '}
                    <span className="text-muted-foreground text-[10px] uppercase not-italic font-bold">
                      / {counts.target} Pioneers
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

            {/* ── CTA — NO_GPS ── */}
            {state === 'NO_GPS' && (
              <Button
                className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white"
                onClick={() => window.location.reload()}
              >
                Retry Detection
              </Button>
            )}

            {/* ── CTA — WAITING_ROOM ── */}
            {state === 'WAITING_ROOM' && (
              <Button
                className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white"
                onClick={() => navigate('/app/friends')}
              >
                <UserPlus className="w-5 h-5 mr-2" /> Invite to Speed Up
              </Button>
            )}

            {/* ── CTA — COMING_SOON (3 states) ── */}
            {state === 'COMING_SOON' && (
              <div className="space-y-3">
                {waitlistStatus === 'joined' ? (
                  <Button
                    disabled
                    className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-green-600 text-white opacity-100 cursor-default"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" /> You're on the Waitlist
                  </Button>
                ) : (
                  <Button
                    className="w-full h-14 rounded-2xl font-bold uppercase shadow-lg bg-primary text-white"
                    onClick={joinWaitlist}
                    disabled={waitlistStatus === 'loading'}
                  >
                    {waitlistStatus === 'loading'
                      ? <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      : <Bell className="w-5 h-5 mr-2" />
                    }
                    {waitlistStatus === 'loading' ? 'Joining...' : 'Join Waitlist'}
                  </Button>
                )}

                {/* Secondary nudge */}
                <button
                  className="w-full text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => navigate('/app/friends')}
                >
                  Or invite friends to speed things up
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
