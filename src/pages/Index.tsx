import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  MapPin, Users, MessageCircle, Sparkles, Globe, 
  Smartphone, Play, Apple, Twitter, Instagram, Linkedin,
  Copyright
} from 'lucide-react';
// import heroImage from '@/assets/hero-image.jpg'; // Keep this commented if unused
import AuthModal from '@/components/auth/AuthModal';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  
  const { user, isLoading } = useAuth(); 
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // 1. Wait for Auth to finish loading
    if (isLoading) return;

    // 2. If user is NOT logged in, do nothing (stay on landing page)
    if (!user) return;

    // 3. IDENTIFY LOCATION
    const hostname = window.location.hostname;
    const isSubdomain = hostname === 'try.usecorridor.xyz';

    // 4. EXECUTE REDIRECT
    if (isSubdomain) {
      // 🚨 CRITICAL: We must leave the subdomain entirely!
      // We cannot use navigate() here because /app doesn't exist on this subdomain.
      // Use the FULL URL of your main site.
      window.location.href = 'https://try.usecorridor.xyz/app';
    } else {
      // If we are on localhost or the main domain, standard navigation works.
      navigate("/app", { replace: true });
    }
  }, [user, isLoading, navigate]);

  // --- PREVENT FLICKER ---
  // While loading or redirecting, show a spinner
  if (isLoading || user) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
       </div>
     );
  }
  // --- FIX END ---

  const handleAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  const features = [
    { icon: <Users className="w-6 h-6" />, title: "Social Discovery", desc: "Find friends nearby instantly." },
    { icon: <MapPin className="w-6 h-6" />, title: "Privacy Mode", desc: "Share location on your terms." },
    { icon: <MessageCircle className="w-6 h-6" />, title: "Live Chat", desc: "Seamless real-time messaging." },
    { icon: <Sparkles className="w-6 h-6" />, title: "Events", desc: "Host parties & sell tickets." },
  ];

  const footerLinks = {
    company: [
      { label: "About Us", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Investors", href: "#" },
      { label: "Status", href: "#" },
    ],
    legal: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Use", href: "#" },
      { label: "Cookie Policy", href: "#" },
    ],
    support: [
      { label: "Help Center", href: "#" },
      { label: "Safety Center", href: "#" },
      { label: "Contact Us", href: "#" },
    ]
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      
      {/* HERO SECTION */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        
        {/* Background Image with Gradient Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background z-10" />
        </div>

        {/* Content */}
        <div className="relative z-20 container-mobile text-center text-white px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Globe className="w-3 h-3 text-blue-400" />
            <span className="text-xs font-medium tracking-wide">Connecting 10,000+ Users</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight animate-in fade-in slide-in-from-bottom-8 duration-1000">
            Your World, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Connected.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-white/80 max-w-xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            The social map that lets you see who's nearby, plan spontaneous hangouts, and discover local events securely.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300">
            <Button 
              size="lg" 
              className="min-w-[200px] h-14 text-lg font-semibold rounded-full gradient-primary text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:shadow-[0_0_30px_rgba(37,99,235,0.7)] transition-all hover:scale-105"
              onClick={() => handleAuth('signup')}
            >
              Join Now - It's Free
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="min-w-[200px] h-14 text-lg font-semibold rounded-full bg-white/5 border-white/20 text-white hover:bg-white/10 backdrop-blur-sm"
              onClick={() => handleAuth('login')}
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 px-4 bg-background">
        <div className="container-mobile">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Built for real-life connections, keeping privacy and ease-of-use in mind.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="border border-border/50 hover:border-primary/50 transition-all hover:shadow-lg group bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* DOWNLOAD APP SECTION */}
      <section className="py-20 bg-muted/30 border-y border-border relative overflow-hidden">
        <div className="container-mobile relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            
            <div className="flex-1 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider">
                <Smartphone className="w-3 h-3" /> Mobile App
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Take Lynq with you everywhere.</h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto lg:mx-0">
                Get the full experience on your phone. Real-time location sharing, instant notifications, and smoother chatting.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2">
                <Button variant="outline" disabled className="h-14 px-6 rounded-xl bg-black text-white hover:bg-gray-800 transition-all flex items-center gap-3 cursor-not-allowed shadow-lg">
                   <Play className="w-6 h-6 fill-current" />
                   <div className="text-left">
                     <div className="text-[10px] uppercase font-medium opacity-80">Coming Soon to</div>
                     <div className="text-base font-bold leading-none">Google Play</div>
                   </div>
                </Button>

                <Button variant="outline" disabled className="h-14 px-6 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground flex items-center gap-3 cursor-not-allowed opacity-70">
                   <Apple className="w-6 h-6 pb-1" />
                   <div className="text-left">
                     <div className="text-[10px] uppercase font-medium">Coming Soon to</div>
                     <div className="text-base font-bold leading-none">App Store</div>
                   </div>
                </Button>
              </div>
            </div>

            <div className="flex-1 relative w-full max-w-sm lg:max-w-md mx-auto">
               <div className="relative aspect-[9/18] rounded-[2.5rem] border-8 border-gray-900 bg-gray-800 shadow-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-background flex flex-col">
                    <div className="flex-1 bg-muted/20 relative p-4">
                       <div className="absolute top-1/4 left-1/4 w-8 h-8 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-bounce" />
                       <div className="absolute top-1/2 right-1/3 w-8 h-8 bg-purple-500 rounded-full border-4 border-white shadow-lg" />
                       <div className="absolute bottom-1/3 left-1/2 w-8 h-8 bg-green-500 rounded-full border-4 border-white shadow-lg" />
                    </div>
                    <div className="h-16 bg-white border-t flex justify-around items-center px-4">
                      <div className="w-8 h-8 rounded-full bg-gray-100" />
                      <div className="w-8 h-8 rounded-full bg-blue-100" />
                      <div className="w-8 h-8 rounded-full bg-gray-100" />
                    </div>
                  </div>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-6 bg-gray-900 rounded-b-2xl" />
               </div>
               
               <div className="absolute -z-10 top-10 -right-10 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
               <div className="absolute -z-10 bottom-10 -left-10 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
            </div>

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-background border-t border-border pt-16 pb-8">
        <div className="container-mobile px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            
            <div className="col-span-2 md:col-span-1">
              <h3 className="font-bold text-xl mb-4 tracking-tight gradient-primary bg-clip-text text-transparent inline-block">Lynq</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Connecting friends, communities, and events in the real world.
              </p>
              <div className="flex gap-4">
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Twitter className="w-5 h-5" /></a>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Instagram className="w-5 h-5" /></a>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Linkedin className="w-5 h-5" /></a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {footerLinks.company.map((link, i) => (
                  <li key={i}><a href={link.href} className="hover:text-foreground transition-colors">{link.label}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {footerLinks.legal.map((link, i) => (
                  <li key={i}><a href={link.href} className="hover:text-foreground transition-colors">{link.label}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                 {footerLinks.support.map((link, i) => (
                  <li key={i}><a href="https://chat.whatsapp.com/Fe2gkrxSOtZHuwMQXJltKR?mode=wwt" className="hover:text-foreground transition-colors">{link.label}</a></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Copyright className="w-3 h-3" /> 
              <span>{currentYear} Lynq. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6">
               <span>Made with ❤️ for connection</span>
            </div>
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
