import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  MapPin, Users, MessageCircle, Sparkles, Globe, 
  Smartphone, Lock, ChevronRight, Share2,
  Twitter, Instagram, Linkedin, Copyright, Loader2,
  ArrowRight, Flame, Star
} from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';
import { Card, CardContent } from '@/components/ui/card';
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
    img: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=600&q=80',
  },
  {
    name: 'Abuja',
    tag: 'The Capital Moves',
    img: 'https://images.unsplash.com/photo-1611348586840-ea9872d33411?w=600&q=80',
  },
  {
    name: 'Port Harcourt',
    tag: 'Garden City Rising',
    img: 'https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?w=600&q=80',
  },
  {
    name: 'Ibadan',
    tag: 'Ancient & Always Forward',
    img: 'https://images.unsplash.com/photo-1547481887-a26e2cacb5b2?w=600&q=80',
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

  const { user, loading } = useAuth(); 
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const targetDate = new Date('2026-06-01T00:00:00');
  const daysLeft = Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

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
      <div className="w-full py-2 px-4 text-center text-xs font-bold uppercase tracking-[0.2em]" style={{ background: '#E8511A', color: '#fff' }}>
        🇳🇬 &nbsp; Ahmia goes LIVE June 1st &nbsp;·&nbsp; {daysLeft} days to go &nbsp;·&nbsp; Secure your spot now &nbsp; 🔥
      </div>

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

      {/* ── ZONE UNLOCK CARD ── */}
      <section className="px-6 pb-16">
        <div className="rounded-3xl p-6 overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {zoneLoading || !zone ? (
            <div className="flex items-center gap-3 py-6 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Detecting your area…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#E8511A' }}>
                    {zone.inZone ? '📍 You are in a launch zone' : '🔍 Nearest launch zone'}
                  </p>
                  <h3 className="text-2xl font-black" style={{ letterSpacing: '-0.03em' }}>
                    {zone.city} — {cityProgress}% unlocked
                  </h3>
                </div>
                {zone.unlocked
                  ? <Sparkles className="w-5 h-5 mt-1 flex-shrink-0" style={{ color: '#E8511A' }} />
                  : <Lock className="w-5 h-5 mt-1 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />}
              </div>

              {/* Progress bar */}
              <div className="rounded-full overflow-hidden mb-4" style={{ height: 10, background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${cityProgress}%`,
                    background: 'linear-gradient(90deg, #E8511A, #F0851A)',
                    boxShadow: '0 0 12px rgba(232,81,26,0.6)'
                  }}
                />
              </div>

              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {zone.unlocked
                  ? `${zone.city} is live — sign up and start meeting people around you.`
                  : zone.target > 0
                    ? `${Math.max(0, zone.target - zone.current).toLocaleString()} more sign-ups needed to activate ${zone.city}. Invite your people.`
                    : `Be the founding member in ${zone.city}.`}
              </p>

              <button
                className="mt-5 flex items-center gap-2 text-sm font-bold px-5 py-3 rounded-xl transition-all active:scale-95"
                style={{ background: '#E8511A', color: '#fff' }}
                onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
              >
                Join & help unlock {zone.city}
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
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

      {/* ── FOOTER ── */}
      <footer className="px-6 pb-12 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-black tracking-tighter mb-1" style={{ letterSpacing: '-0.04em' }}>
              ahmia<span style={{ color: '#E8511A' }}>.</span>
            </h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Real world. Real friends. Real-time.</p>
          </div>

          <div className="flex gap-4">
            <a href="https://instagram.com/@ahmiahq" className="transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E8511A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://linkedin.com/company/ahmiahq" className="transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#E8511A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              <Linkedin className="w-5 h-5" />
            </a>
          </div>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            <Copyright className="inline w-3 h-3 mr-1" />{currentYear} Ahmia Nigeria Ltd. Built with ❤️ by Corridor.
          </p>
        </div>
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
