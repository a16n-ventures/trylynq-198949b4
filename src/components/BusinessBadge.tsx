/**
 * BusinessBadge
 *
 * Visual marker for verified business accounts (account_type === 'business').
 * Intentionally distinct from the premium ("blue tick") badge so the two
 * concerns stay separate:
 *   - Premium  → paid feature  → <VerifiedBadge /> (blue checkmark)
 *   - Business → account type  → <BusinessBadge /> (cyan shield)
 */
import { ShieldCheck } from 'lucide-react';

interface BusinessBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function BusinessBadge({ className, size = 'sm' }: BusinessBadgeProps) {
  return (
    <ShieldCheck
      aria-label="Verified business"
      className={`${sizeClasses[size]} text-cyan-500 flex-shrink-0 ${className || ''}`}
    />
  );
}
