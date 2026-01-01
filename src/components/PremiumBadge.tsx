import { Crown } from 'lucide-react';
import { useHasPremiumBadge } from '@/hooks/usePremiumStatus';
import { cn } from '@/lib/utils';

interface PremiumBadgeProps {
  userId?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

/**
 * Premium Badge component that displays a crown icon for premium users
 * Automatically checks the user's premium status
 */
export const PremiumBadge = ({ 
  userId, 
  size = 'sm', 
  className,
  showTooltip = true 
}: PremiumBadgeProps) => {
  const { hasBadge, isLoading } = useHasPremiumBadge(userId);

  if (isLoading || !hasBadge) return null;

  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center justify-center text-amber-500",
        showTooltip && "cursor-help",
        className
      )}
      title={showTooltip ? "Premium Member" : undefined}
    >
      <Crown className={sizeClasses[size]} fill="currentColor" />
    </div>
  );
};

/**
 * Inline premium badge for use next to usernames
 */
export const InlinePremiumBadge = ({ userId }: { userId?: string }) => {
  const { hasBadge } = useHasPremiumBadge(userId);
  
  if (!hasBadge) return null;
  
  return (
    <Crown className="w-3.5 h-3.5 text-amber-500 inline-block ml-1" fill="currentColor" />
  );
};
