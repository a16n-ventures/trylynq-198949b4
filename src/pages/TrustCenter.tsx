import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, ShieldAlert, Clock, ArrowLeft,
  CheckCircle2, XCircle, FileText, Phone, Mail,
  AlertCircle, ChevronRight
} from 'lucide-react';

export default function TrustCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['trust-center-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase.from('profiles') as any)
        .select('display_name, verification_status, trust_score, user_type, skills, phone, email')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const status: 'unverified' | 'pending' | 'verified' =
    profile?.verification_status || 'unverified';

  const statusConfig = {
    unverified: {
      icon: <ShieldAlert className="w-10 h-10 text-muted-foreground" />,
      label: 'Not Verified',
      color: 'bg-muted text-muted-foreground',
      description: 'Complete verification to unlock your full business profile, appear on the map, and build trust with customers.',
    },
    pending: {
      icon: <Clock className="w-10 h-10 text-amber-500" />,
      label: 'Verification Pending',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      description: 'Your documents are under review. This usually takes 1–3 business days.',
    },
    verified: {
      icon: <ShieldCheck className="w-10 h-10 text-primary" />,
      label: 'Verified Business',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      description: 'Your business is verified. You appear on the map and customers can trust your listings.',
    },
  };

  const current = statusConfig[status];

  // Checklist items — each maps to a profile field or action
  const checks = [
    {
      label: 'Account type set to Business',
      done: profile?.user_type === 'business',
    },
    {
      label: 'Phone number added',
      done: !!profile?.phone,
    },
    {
      label: 'Skills / services listed',
      done: Array.isArray(profile?.skills) && profile.skills.length > 0,
    },
    {
      label: 'Identity verification submitted',
      done: status === 'pending' || status === 'verified',
    },
    {
      label: 'Verification approved',
      done: status === 'verified',
    },
  ];

  const completedCount = checks.filter((c) => c.done).length;

  return (
    <div className="container-mobile py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Trust Center</h1>
          <p className="text-xs text-muted-foreground">Build credibility with verified status</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Clock className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Status card */}
          <Card className="overflow-hidden border-border/50">
            <div className={`h-1.5 w-full ${status === 'verified' ? 'bg-primary' : status === 'pending' ? 'bg-amber-400' : 'bg-muted'}`} />
            <CardContent className="p-5 flex items-center gap-4">
              {current.icon}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-base">{current.label}</p>
                  <Badge className={`text-[10px] border-0 ${current.color}`}>{status.toUpperCase()}</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{current.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Progress checklist */}
          <Card className="border-border/50">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Verification Progress</h3>
                <span className="text-xs text-muted-foreground">{completedCount}/{checks.length} complete</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / checks.length) * 100}%` }}
                />
              </div>
              <ul className="space-y-3 pt-1">
                {checks.map((check) => (
                  <li key={check.label} className="flex items-center gap-3">
                    {check.done
                      ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      : <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                    <span className={`text-sm ${check.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {check.label}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* CTA — only show if not yet verified */}
          {status !== 'verified' && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-sm">
                    {status === 'pending' ? 'Verification in Progress' : 'Start Verification'}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {status === 'pending'
                    ? 'We\'re reviewing your submission. You\'ll be notified once approved.'
                    : 'Submit your business documents to get the verified badge. It takes 1–3 days.'}
                </p>
                {status === 'unverified' && (
                  <Button className="w-full gradient-primary text-white shadow-sm"
                    onClick={() => navigate('/vouch-it')}>
                    <FileText className="w-4 h-4 mr-2" /> Start Verification
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* What verification unlocks */}
          <Card className="border-border/50">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm mb-3">What Verification Unlocks</h3>
              {[
                { icon: <ShieldCheck className="w-4 h-4 text-primary" />, text: 'Verified badge on your profile and listings' },
                { icon: <CheckCircle2 className="w-4 h-4 text-primary" />, text: 'Discoverable pin on the map for nearby customers' },
                { icon: <Phone className="w-4 h-4 text-primary" />, text: 'Direct contact button enabled on your catalog items' },
                { icon: <Mail className="w-4 h-4 text-primary" />, text: 'Priority visibility in search and marketplace' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  {item.icon}
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="space-y-2">
            <button
              onClick={() => navigate('/app/marketplace')}
              className="w-full flex items-center justify-between p-4 bg-muted/40 rounded-2xl border border-border/40 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Manage Catalog</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate('/app/map?view=services')}
              className="w-full flex items-center justify-between p-4 bg-muted/40 rounded-2xl border border-border/40 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">View My Pin on Map</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
