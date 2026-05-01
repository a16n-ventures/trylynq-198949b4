import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  MapPin, Users, MessageCircle, Sparkles, Globe, 
  Smartphone, Lock, ChevronRight, Share2,
  Twitter, Instagram, Linkedin, Copyright, Loader2
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

const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [referralName, setReferralName] = useState<string | null>(null);
  const [zone, setZone] = useState<ZoneStatus>(null);
  const [zoneLoading, setZoneLoading] = useState(true);

  const { user, loading } = useAuth(); 
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const targetDate = new Date('2026-06-01T00:00:00');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('pending_referral_code', refCode);
      // Logic to capitalize and clean name for UI
      setReferralName(refCode.charAt(0).toUpperCase() + refCode.slice(1));
    }
  }, []);

  // Detect user location → match nearest city_milestone
  useEffect(() => {
    let cancelled = false;
    const findZone = async () => {
      const { data: milestones } = await supabase.from('city_milestones').select('*');
      if (cancelled || !milestones || milestones.length === 0) {
        setZoneLoading(false);
        return;
      }

      const matchTo = (lat: number, lng: number) => {
        let best: any = null;
        let bestDist = Infinity;
        for (const m of milestones) {
          const d = distKm(lat, lng, m.center_lat, m.center_long);
          if (d < bestDist) { bestDist = d; best = m; }
        }
        const inZone = best && bestDist <= (best.radius_km ?? 25);
        if (best) {
          setZone({
            city: best.city_name,
            current: best.current_count ?? 0,
            target: best.target_count ?? 0,
            unlocked: best.is_unlocked === true,
            inZone: !!inZone,
          });
        }
        setZoneLoading(false);
      };

      if (!navigator.geolocation) {
        // No GPS — show first/largest zone as a teaser
        const m = milestones[0];
        setZone({ city: m.city_name, current: m.current_count ?? 0, target: m.target_count ?? 0, unlocked: m.is_unlocked === true, inZone: false });
        setZoneLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => !cancelled && matchTo(pos.coords.latitude, pos.coords.longitude),
        () => {
          if (cancelled) return;
          const m = milestones[0];
          setZone({ city: m.city_name, current: m.current_count ?? 0, target: m.target_count ?? 0, unlocked: m.is_unlocked === true, inZone: false });
          setZoneLoading(false);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    };
    findZone();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-blue-500/30">
      
      {/* EXCLUSIVE TOP BAR */}
      <div className="w-full bg-blue-600 py-2 px-4 text-center text-xs font-bold uppercase tracking-widest">
        Ahmia goes LIVE on June 1st: The movement starts in {Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days
      </div>

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-32 flex items-center justify-center overflow-hidden">
        <div className="container-mobile relative z-20 text-center px-4">
          
          {/* Referral Badge */}
          {referralName && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8 animate-bounce">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">You've been invited by {referralName}</span>
            </div>
          )}

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-6 leading-[0.9]">
            STOP SCROLLING. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">START LIVING.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Ahmia is a location-based social discovery platform designed to turn "people nearby" into "plans tonight." Join the exclusive waitlist to unlock your city.
          </p>

          {/* UNLOCK PROGRESS CARD — dynamic based on detected zone */}
          <Card className="max-w-md mx-auto bg-white/5 border-white/10 backdrop-blur-xl mb-12 overflow-hidden">
            <CardContent className="p-6">
              {zoneLoading || !zone ? (
                <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Detecting your city…
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-end mb-4">
                    <div className="text-left">
                      <p className="text-xs font-bold uppercase text-blue-400 tracking-wider">
                        {zone.inZone ? 'You\'re in a launch zone' : 'Nearest launch zone'}
                      </p>
                      <h3 className="text-xl text-white font-bold">
                        {zone.target > 0
                          ? `${zone.city} is ${Math.min(100, Math.round((zone.current / zone.target) * 100))}% Unlocked`
                          : `${zone.city} ${zone.unlocked ? 'is LIVE' : 'coming soon'}`}
                      </h3>
                    </div>
                    {zone.unlocked
                      ? <Sparkles className="w-5 h-5 text-blue-400 mb-1" />
                      : <Lock className="w-5 h-5 text-gray-500 mb-1" />}
                  </div>

                  <div className="w-full h-4 bg-white/10 rounded-full mb-4 p-1">
                    <div 
                      className="h-full gradient-primary rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.6)]"
                      style={{ width: `${zone.target > 0 ? Math.min(100, (zone.current / zone.target) * 100) : (zone.unlocked ? 100 : 5)}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-400">
                    {zone.unlocked
                      ? `${zone.city} is live — sign up to start meeting people nearby.`
                      : zone.target > 0
                        ? `We need ${Math.max(0, zone.target - zone.current)} more sign-ups to activate Day 1 events.`
                        : `Be the first to claim ${zone.city}.`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="group min-w-[240px] h-16 text-lg font-bold rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all"
              onClick={() => { setAuthMode('signup'); setShowAuth(true); }}
            >
              Secure My Spot
              <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] -z-10" />
      </section>

      {/* HOW IT WORKS - THREE STEPS */}
      <section className="py-24 bg-[#0a0a0a] border-y border-white/5">
        <div className="container-mobile px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto text-blue-500 border border-blue-500/20">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">1. Join the Squad</h3>
              <p className="text-gray-400">Sign up and verify your local neighborhood or campus.</p>
            </div>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-indigo-600/10 rounded-3xl flex items-center justify-center mx-auto text-indigo-500 border border-indigo-500/20">
                <Share2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">2. Unlock Your Area</h3>
              <p className="text-gray-400">Share with friends. Once your zone hits the goal, the map goes live.</p>
            </div>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-purple-600/10 rounded-3xl flex items-center justify-center mx-auto text-purple-500 border border-purple-500/20">
                <MapPin className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">3. Meet Up</h3>
              <p className="text-gray-400">Host activities, join events, and foster real-world connections.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CATALYST CTA */}
      <section className="py-20 px-4">
        <div className="container-mobile max-w-4xl bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-black mb-6">Are you a natural leader?</h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
              We're looking for Campus Catalysts to lead the Ahmia movement. Get paid to build community.
            </p>
            <Button asChild size="lg" variant="secondary" className="rounded-full font-bold px-8 h-14 bg-white text-blue-600 hover:bg-gray-100">
              <a 
                href="https://forms.gle/EprHKfnSRjDHDVDY6" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Apply to the Catalyst Program
              </a>
            </Button>
          </div>
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
        </div>
      </section>

      {/* FOOTER - Minimalist */}
      <footer className="py-12 border-t border-white/5">
        <div className="container-mobile px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-black tracking-tighter mb-2">AHMIA</h3>
            <p className="text-gray-500 text-sm">Real world. Real friends. Real-time.</p>
          </div>
          
          <div className="flex gap-4">
            {/* <a href="https://crunchbase.com/company/ahmia" className="text-gray-400 hover:text-white transition-colors"><Twitter /></a> */}
            <a href="https://instagram.com/@ahmiahq" className="text-gray-400 hover:text-white transition-colors"><Instagram /></a>
            <a href="https://linkedin.com/company/ahmiahq" className="text-gray-400 hover:text-white transition-colors"><Linkedin /></a>
          </div>

          <div className="text-gray-500 text-xs">
            <Copyright className="inline w-3 h-3 mr-1" /> {currentYear} Ahmia Nigeria Ltd. Built with ❤️ by Corridor.
          </div>
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
