import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  MapPin, Users, Sparkles, Lock,
  ChevronRight, Instagram, Linkedin, Copyright, Loader2,
  ArrowRight, Flame, Star, CheckCircle2, TrendingUp
} from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Haversine distance (km)
function distKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

type ZoneStatus = {
  city: string;
  current: number;
  target: number;
  unlocked: boolean;
  inZone: boolean;
} | null;

// Nigerian city data with Unsplash aerial/street photos
const NIGERIAN_CITIES = [
  {
    name: 'Lagos',
    tag: 'The City That Never Sleeps',
    img: '/lagos.png',
  },
  {
    name: 'Abuja',
    tag: 'The Capital Moves',
    img: '/abuja-1.png',
  },
  {
    name: 'Cross River',
    tag: 'Street Party and Rainforest Adventure',
    img: '/cross-river-1.png',
  },
  {
    name: 'Abia',
    tag: 'Trade, Craftsmanship, and Culture',
    img: '/abia-2.png',
  },
  {
    name: 'Ogun',
    tag: 'A Vibrant Blend of Culture and History',
    img: '/ogun-2.png',
  },
  {
    name: 'Ibadan',
    tag: 'Ancient & Always Forward',
    img: '/ibadan.png',
  },
];

const FEATURES = [
  {
    icon: MapPin,
    title: 'Your Hood, Your Vibe',
    body: 'Discover what\'s happening around you — from street food pop-ups to rooftop hangouts — all within your local area.',
    color: '#E8511A',
  },
  {
    icon: Users,
    title: 'Real People, Real Plans',
    body: 'No ghosting. No fake profiles. Just your neighbours and coursemates making actual moves.',
    color: '#1A7AE8',
  },
  {
    icon: Flame,
    title: 'Unlock Your City',
    body: 'When enough people in your area join, Ahmia goes live for everyone. You hold the key.',
    color: '#E8C21A',
  },
  {
    icon: Star,
    title: 'Campus Catalysts',
    body: 'Student leaders get tools, rep, and earnings to build community in their schools.',
    color: '#1AE87A',
  },
];

const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [referralName, setReferralName] = useState<string | null>(null);
  const [zone, setZone] = useState<ZoneStatus>(null);
  const [zoneLoading, setZoneLoading] = useState(true);
  const [activeCityIdx, setActiveCityIdx] = useState(0);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  const { user, loading } = useAuth(); 
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const targetDate = new Date('2026-05-23T00:00:00');
  const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('pending_referral_code', refCode);
      setReferralName(refCode.charAt(0).toUpperCase() + refCode.slice(1));
    }
  }, []);

  // Auto-rotate city cards
  useEffect(() => {
    const t = setInterval(() => setActiveCityIdx(i => (i + 1) % NIGERIAN_CITIES.length), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const matchTo = async (lat: number, lng: number) => {
      const { data: milestones } = await supabase.from('city_milestones').select('*');
      if (cancelled || !milestones || milestones.length === 0) { setZoneLoading(false); return; }
      let best: any = null, bestDist = Infinity;
      for (const m of milestones) {
        const d = distKm(lat, lng, m.center_lat, m.center_long);
        if (d < bestDist) { bestDist = d; best = m; }
      }
      const inZone = best && bestDist <= (best.radius_km ?? 25);
      if (best) setZone({ city: best.city_name, current: best.current_count ?? 0, target: best.target_count ?? 0, unlocked: best.is_unlocked === true, inZone: !!inZone });
      setZoneLoading(false);
    };

    const ipFallback = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data?.latitude && data?.longitude && !cancelled) { await matchTo(data.latitude, data.longitude); return; }
      } catch (e) { console.warn('IP geo failed', e); }
      const { data: milestones } = await supabase.from('city_milestones').select('*').limit(1);
      if (cancelled) return;
      if (milestones && milestones[0]) {
        const m = milestones[0];
        setZone({ city: m.city_name, current: m.current_count ?? 0, target: m.target_count ?? 0, unlocked: m.is_unlocked === true, inZone: false });
      }
      setZoneLoading(false);
    };

    if (!navigator.geolocation) { ipFallback(); return () => { cancelled = true; }; }
    navigator.geolocation.getCurrentPosition(
      (pos) => !cancelled && matchTo(pos.coords.latitude, pos.coords.longitude),
      () => { if (!cancelled) ipFallback(); },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [user, loading, navigate]);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistSubmitting(true);
    try {
      const { error } = await supabase.from('waitlist').insert({
        email: waitlistEmail.trim().toLowerCase(),
        city: zone?.city || 'Unknown',
        created_at: new Date().toISOString(),
      });
      if (error && error.code !== '23505') throw error;
      setWaitlistDone(true);
      setWaitlistEmail('');
    } catch (err: any) {
      console.error('Waitlist error:', err);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D0D0D' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#E8511A' }} />
      </div>
    );
  }

  const cityProgress = zone
    ? (zone.target > 0 ? Math.min(100, Math.round((zone.current / zone.target) * 100)) : zone.unlocked ? 100 : 5)
    : 0;

  return (
    <div className="min-h-screen text-white flex flex-col font-sans" style={{ background: '#0D0D0D', fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>

      {/* ── LAUNCH TICKER ── */} 
      {/*
      <div className="w-full py-2 px-4 text-center text-xs font-bold uppercase tracking-[0.2em]" style={{ background: '#E8511A', color: '#fff' }}>
        🇳🇬 &nbsp; Ahmia goes LIVE June 1st &nbsp;·&nbsp; {daysLeft} days to go &nbsp;·&nbsp; Secure your spot now &nbsp; 🔥
      </div>
      */}

      {/* ── NAV ── */}
      <nav className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-2xl font-black tracking-tighter" style={{ letterSpacing: '-0.04em' }}>
          ahmia<span style={{ color: '#E8511A' }}>.</span>
        </span>
        <div className="flex gap-3">
          <button
            className="text-sm font-semibold px-4 py-2 rounded-full transition-all"
            style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}
            onClick={() => { setAuthMode('login'); setShowAuth(true); }}
          >
            Log in
          </button>
          <button
            className="text-sm font-bold px-5 py-2 rounded-full transition-all"
            style={{ background: '#E8511A', color: '#fff' }}
            onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
          >
            Join waitlist
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative px-6 pt-16 pb-8 overflow-hidden">

        {/* Referral badge */}
        {referralName && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-sm font-semibold"
            style={{ background: 'rgba(232,81,26,0.12)', border: '1px solid rgba(232,81,26,0.3)', color: '#E8511A' }}>
            <Sparkles className="w-4 h-4" /> {referralName} invited you to Ahmia
          </div>
        )}

        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-4" style={{ color: '#E8511A' }}>
            🇳🇬 &nbsp; For Nigeria. By Nigeria.
          </p>
          <h1 className="font-black leading-none mb-6" style={{ fontSize: 'clamp(3rem, 10vw, 6rem)', letterSpacing: '-0.04em', lineHeight: '0.92' }}>
            Your city.<br />
            Your<br />
            <span style={{ color: '#E8511A', WebkitTextStroke: '0px' }}>people.</span>
          </h1>
          <p className="text-base md:text-lg mb-10 max-w-md leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Ahmia connects you to people and plans in your own neighbourhood — 
            not random strangers on the internet. Real hangouts. Real Lagos. Real Abuja.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <button
              className="group flex items-center gap-3 font-bold text-base px-8 py-4 rounded-2xl transition-all active:scale-95"
              style={{ background: '#E8511A', color: '#fff' }}
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
            >
              Claim my spot
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              className="text-sm font-semibold px-6 py-4 rounded-2xl transition-all"
              style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => { setAuthMode('login'); setShowAuth(true); }}
            >
              Already have an account?
            </button>
          </div>
        </div>

        {/* Background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(232,81,26,0.15) 0%, transparent 70%)', transform: 'translate(30%, -20%)' }} />
      </section>

      {/* ── CITY CARDS ── */}
      <section className="px-6 pt-6 pb-16">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ letterSpacing: '-0.02em' }}>Launching in your city</h2>
          <span className="text-xs font-semibold" style={{ color: '#E8511A' }}>Nigeria-first →</span>
        </div>

        {/* Horizontal scroll strip */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
          {NIGERIAN_CITIES.map((city, idx) => (
            <div
              key={city.name}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all"
              style={{
                width: 200,
                height: 240,
                scrollSnapAlign: 'start',
                border: idx === activeCityIdx ? '2px solid #E8511A' : '2px solid transparent',
                transform: idx === activeCityIdx ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.4s ease',
              }}
              onClick={() => setActiveCityIdx(idx)}
            >
              <img
                src={city.img}
                alt={city.name}
                className="w-full h-full object-cover"
                style={{ filter: 'brightness(0.65)' }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-xs font-semibold mb-1" style={{ color: '#E8511A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{city.tag}</p>
                <h3 className="text-xl font-black" style={{ letterSpacing: '-0.02em' }}>{city.name}</h3>
              </div>
              {idx === activeCityIdx && (
                <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: '#E8511A', boxShadow: '0 0 8px #E8511A' }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── LAUNCH ZONE + WAITLIST ── */}
      <section className="px-6 pb-16 space-y-4">

        {/* Dynamic Zone Status Card */}
        <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(232,81,26,0.3)', background: 'linear-gradient(135deg, rgba(232,81,26,0.08) 0%, rgba(13,13,13,0) 60%)' }}>
          <div className="p-5">
            {/* Status badge + city name */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full inline-block mb-2"
                  style={{
                    background: zone?.unlocked ? 'rgba(26,232,122,0.15)' : 'rgba(232,81,26,0.15)',
                    color: zone?.unlocked ? '#1AE87A' : '#E8511A',
                    border: zone?.unlocked ? '1px solid rgba(26,232,122,0.3)' : '1px solid rgba(232,81,26,0.3)'
                  }}>
                  {zoneLoading ? '📡 Detecting zone...' : zone?.unlocked ? '🟢 Live in your city' : zone?.inZone ? '🔒 Your city is loading' : '🌍 Coming to your city'}
                </span>
                <h2 className="text-2xl font-black leading-tight" style={{ letterSpacing: '-0.03em' }}>
                  {zoneLoading ? 'Finding your zone...' : zone ? zone.city : 'Ahmia Launch Zone'}
                </h2>
                {!zoneLoading && zone && !zone.unlocked && (
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {zone.inZone ? "You're in the zone — help unlock your city." : "Not in a launch zone yet. Join the waitlist."}
                  </p>
                )}
                {!zoneLoading && zone?.unlocked && (
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Ahmia is live here. Join now and start linking up.
                  </p>
                )}
              </div>
              {!zoneLoading && zone && (
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-lg font-black leading-none" style={{ color: '#E8511A' }}>{cityProgress}%</span>
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>filled</span>
                </div>
              )}
            </div>

            {/* Progress bar — locked cities only */}
            {!zoneLoading && zone && !zone.unlocked && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <span><span className="font-bold text-white">{zone.current.toLocaleString()}</span> pioneers joined</span>
                  <span>goal: <span className="font-bold text-white">{zone.target.toLocaleString()}</span></span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${cityProgress}%`, background: cityProgress >= 75 ? '#1AE87A' : cityProgress >= 40 ? '#E8C21A' : '#E8511A' }} />
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {zone.target - zone.current > 0
                    ? `${(zone.target - zone.current).toLocaleString()} more people needed to unlock`
                    : 'Goal reached! Launch imminent.'}
                </p>
              </div>
            )}

            {/* Unlocked stats */}
            {!zoneLoading && zone?.unlocked && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Pioneers', value: zone.current.toLocaleString(), icon: Users },
                  { label: 'Status', value: 'Live', icon: TrendingUp },
                  { label: 'Events', value: 'Active', icon: Flame },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: '#1AE87A' }} />
                    <p className="text-sm font-black">{value}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* CTA button */}
            {zone?.unlocked ? (
              <button
                className="w-full flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
                style={{ background: '#1AE87A', color: '#0D0D0D' }}
                onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
              >
                Join Ahmia — it's free <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="w-full flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-2xl transition-all active:scale-95"
                style={{ background: '#E8511A', color: '#fff' }}
                onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
              >
                Claim my pioneer spot <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Beta Waitlist email capture — shown for non-live zones */}
        {!zoneLoading && zone && !zone.unlocked && (
          <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4" style={{ color: '#E8511A' }} />
              <span className="text-sm font-bold">Beta Waitlist</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                style={{ background: 'rgba(232,81,26,0.15)', color: '#E8511A' }}>
                {zone.current.toLocaleString()} waiting
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Drop your email. Be first to know when {zone.inZone ? zone.city : 'your city'} goes live.
            </p>
            {waitlistDone ? (
              <div className="flex items-center gap-2 py-3 px-4 rounded-xl"
                style={{ background: 'rgba(26,232,122,0.1)', border: '1px solid rgba(26,232,122,0.2)' }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#1AE87A' }} />
                <p className="text-sm font-semibold" style={{ color: '#1AE87A' }}>
                  You're on the list! We'll notify you when {zone.city} unlocks.
                </p>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="flex-1 h-11 px-4 rounded-xl text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
                <button
                  type="submit"
                  disabled={waitlistSubmitting}
                  className="h-11 px-5 rounded-xl font-bold text-sm flex-shrink-0 transition-all active:scale-95 disabled:opacity-60"
                  style={{ background: '#E8511A', color: '#fff' }}
                >
                  {waitlistSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Notify me'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Launch event cards */}
        <div className="rounded-3xl overflow-hidden relative shadow-2xl" style={{ border: '1px solid rgba(232,81,26,0.25)' }}>
          <div className="relative h-52 w-full">
            <img src="/abuja-1.png" alt="Ahmia FCT Launch" loading="lazy"
              className="w-full h-full object-cover" style={{ filter: 'brightness(0.6)' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 5%, transparent 60%)' }} />
            <span className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full"
              style={{ background: '#E8511A', color: '#fff' }}>🔥 Flagship Launch</span>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: '#FFB088' }}>Abuja, FCT</p>
              <h3 className="text-xl font-black leading-tight" style={{ letterSpacing: '-0.03em' }}>FCT Launch</h3>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Events. Hangouts. FCT. Where vibes and beauty blends.</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {daysLeft > 0 ? <><span className="font-black text-white">{daysLeft}</span> days to go</> : '🟢 Live now'}
            </div>
            <button className="flex items-center gap-2 font-bold text-xs px-4 py-2.5 rounded-xl transition-all active:scale-95"
              style={{ background: '#E8511A', color: '#fff' }}
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}>
              RSVP free <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="rounded-3xl overflow-hidden relative shadow-2xl" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="relative h-52 w-full">
            <img src="/ahmia-zaria-launch.jpg" alt="Zaria Launch" loading="lazy"
              className="w-full h-full object-cover" style={{ filter: 'brightness(0.6)' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 5%, transparent 60%)' }} />
            <span className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', backdropFilter: 'blur(8px)' }}>🔥 Beta Waitlist</span>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: '#FFB088' }}>ABU Zaria</p>
              <h3 className="text-xl font-black leading-tight" style={{ letterSpacing: '-0.03em' }}>Zaria Launch</h3>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Music. Jollof. Real link-ups. The day Northern Nigeria gets its city.</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Coming soon</div>
            <button className="flex items-center gap-2 font-bold text-xs px-4 py-2.5 rounded-xl transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}>
              Join waitlist <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="px-6 pb-16" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4rem' }}>
        <p className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: '#E8511A' }}>The process</p>
        <h2 className="text-3xl font-black mb-12" style={{ letterSpacing: '-0.03em' }}>Simple as sunday jollof.</h2>

        <div className="space-y-6">
          {[
            { num: '01', title: 'Join the squad', body: 'Sign up with your neighbourhood or campus. Takes 60 seconds.' },
            { num: '02', title: 'Bring your people', body: 'Share your link. Every new person moves your city closer to launch day.' },
            { num: '03', title: 'Link up IRL', body: 'Once your zone hits the goal, the map goes live. Host events, join hangouts, show face.' },
          ].map((step) => (
            <div key={step.num} className="flex gap-5 items-start p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-3xl font-black flex-shrink-0" style={{ color: 'rgba(232,81,26,0.35)', lineHeight: 1, letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums' }}>
                {step.num}
              </span>
              <div>
                <h3 className="font-bold text-base mb-1">{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="px-6 pb-16" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4rem' }}>
        <p className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: '#E8511A' }}>Features</p>
        <h2 className="text-3xl font-black mb-10" style={{ letterSpacing: '-0.03em' }}>Built for how<br />Nigerians move.</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-5 rounded-2xl flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}>
                <f.icon className="w-5 h-5" style={{ color: f.color }} />
              </div>
              <div>
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CATALYST CTA ── */}
      <section className="px-6 pb-16">
        <div className="rounded-3xl p-8 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A0A04 0%, #2D1106 100%)', border: '1px solid rgba(232,81,26,0.25)' }}>
          {/* texture overlay */}
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(232,81,26,0.04) 20px, rgba(232,81,26,0.04) 21px)' }} />

          <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4 inline-block"
              style={{ background: 'rgba(232,81,26,0.2)', color: '#E8511A', border: '1px solid rgba(232,81,26,0.3)' }}>
              🔥 Catalyst Programme
            </span>
            <h2 className="text-2xl font-black mb-3" style={{ letterSpacing: '-0.03em' }}>
              Are you the connector<br />in your area?
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
              We're recruiting Campus Catalysts across Nigeria. Lead the Ahmia movement in your school or hood — and get paid for it.
            </p>
            <a
              href="https://forms.gle/EprHKfnSRjDHDVDY6"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-xl transition-all active:scale-95"
              style={{ background: '#E8511A', color: '#fff' }}
            >
              Apply now
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="px-6 pb-16 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4rem' }}>
        <p className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Spread the word</p>
        <h2 className="text-2xl font-black mb-4" style={{ letterSpacing: '-0.03em' }}>Tell your people.<br />Unlock your city faster.</h2>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Every person you bring in moves the launch bar forward. Share Ahmia.
        </p>
        <button
          className="font-bold text-base px-8 py-4 rounded-2xl transition-all active:scale-95 w-full max-w-xs mx-auto block"
          style={{ background: '#E8511A', color: '#fff' }}
          onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
        >
          Get my referral link
        </button>
      </section>

            {/* ── FOOTER ── */}{/* ── FOOTER ── */}
      <footer className="px-6 pb-12 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Top row: brand + social */}
        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <h3 className="text-2xl font-black tracking-tighter mb-1" style={{ letterSpacing: '-0.04em' }}>
              ahmia<span style={{ color: '#E8511A' }}>.</span>
            </h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Real world. Real friends. Real-time.</p>
          </div>
          <div className="flex gap-3 mt-1">
            <a href="https://instagram.com/@ahmiahq"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E8511A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
              <Instagram className="w-4 h-4" />
            </a>
            <a href="https://linkedin.com/company/ahmiahq"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E8511A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      
        {/* Middle row: links grid — stacks on mobile, 2-col on sm+ */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-8 gap-y-2 mb-8 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>Legal</p>
            <div><Link to="/legal/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></div>
            <div><Link to="/legal/terms-conditions" className="hover:text-white transition-colors">Terms of Service</Link></div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>Contact</p>
            <div><a href="mailto:ahmia.nigltd@gmail.com" className="hover:text-white transition-colors">ahmia.nigltd@gmail.com</a></div>
            <div><a href="tel:+2342084554366" className="hover:text-white transition-colors">+234 208 455 4366</a></div>
          </div>
        </div>
      
        {/* Bottom: copyright */}
        <p className="text-xs text-center justify-center border-t pt-6" style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.2)' }}>
          <Copyright className="inline w-3 h-3 mr-1" />{currentYear} Ahmia Nigeria Ltd. Built with ❤️ by Corridor.
        </p>
      </footer>

      <AuthModal
        open={showAuth}
        onOpenChange={setShowAuth}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </div>
  );
};

export default Index;
