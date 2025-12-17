import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mail, Eye, EyeOff, Chrome, Lock, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'login' | 'signup';
  onModeChange: (mode: 'login' | 'signup') => void;
}

const AuthModal = ({ open, onOpenChange, mode, onModeChange }: AuthModalProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });
  
  const { toast } = useToast();
  const { signUp, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic Validation
    if (!formData.email || !formData.password) {
      return toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
    }
    if (mode === 'signup' && formData.password !== formData.confirmPassword) {
      return toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive" });
    }
    if (formData.password.length < 6) {
      return toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
    }

    setLoading(true);

    try {
      const { error } = mode === 'signup' 
        ? await signUp(formData.email, formData.password)
        : await signIn(formData.email, formData.password);

      if (error) throw error;

      if (mode === 'signup') {
        toast({ title: "Account Created!", description: "Check your email to verify your account.", className: "bg-green-500 text-white border-0" });
      } else {
        toast({ title: "Welcome back!", description: "Signing you in..." });
        onOpenChange(false);
        navigate('/app');
      }
    } catch (error: any) {
      toast({ title: "Authentication Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Google Sign-In Failed", description: error.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <Dialog className="mx-10" open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-0 shadow-2xl bg-background/95 backdrop-blur-xl p-8">
        <DialogHeader className="text-center space-y-2">
          <DialogTitle className="text-2xl font-bold tracking-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Enter your details to access your account' : 'Join the community and start connecting'}
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Social Auth */}
          <Button variant="outline" className="w-full h-11 font-medium hover:bg-muted/50" onClick={handleGoogle} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Chrome className="w-4 h-4 mr-2" />}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><Separator /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or continue with</span></div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="pl-10 h-11 bg-muted/30" 
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-10 pr-10 h-11 bg-muted/30" 
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label>Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-10 h-11 bg-muted/30" 
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full h-11 gradient-primary text-white font-semibold shadow-md hover:shadow-lg transition-all" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <span className="flex items-center">
                  {mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4 ml-2" />
                </span>
              )}
            </Button>
          </form>

          {/* Footer Switch */}
          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button 
              type="button"
              onClick={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
              className="ml-2 font-semibold text-primary hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
      
