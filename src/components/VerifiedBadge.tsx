/**
 * Backwards-compatible shim.
 *
 * `VerifiedBadge` has been consolidated into the canonical {@link PremiumBadge}
 * (blue checkmark) which is the single source of truth for premium / verified
 * users. New code should import `PremiumBadge` directly:
 *
 *   import { PremiumBadge } from '@/components/PremiumBadge';
 *
 * For verified *businesses* (account_type === 'business' with
 * verification_status === 'verified'), use `BusinessBadge` (cyan shield).
 */
import { useSinglePremiumStatus } from '@/hooks/usePremiumStatus';
import { PremiumBadge } from '@/components/PremiumBadge';

interface VerifiedBadgeProps {
  isPremium?: boolean;
  userId?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function VerifiedBadge({ isPremium, userId, className, size = 'sm' }: VerifiedBadgeProps) {
  const { isPremium: fetchedPremium, isLoading } = useSinglePremiumStatus(
    isPremium === undefined ? userId : undefined
  );
  const show = isPremium !== undefined ? isPremium : fetchedPremium;
  if (isLoading || !show) return null;
  return <PremiumBadge show className={className} size={size} />;
}

export default VerifiedBadge;
