import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Loader2 } from "lucide-react";
import type { Friendship } from "@/hooks/useFriends";

interface RequestCardProps {
  request: Friendship;
  type: 'incoming' | 'outgoing';
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
  isCancelling?: boolean;
}

export function RequestCard({ 
  request, 
  type,
  onAccept,
  onReject,
  onCancel,
  isAccepting,
  isRejecting,
  isCancelling
}: RequestCardProps) {
  const profile = type === 'incoming' ? request.requester : request.addressee;
  const borderClass = type === 'incoming' 
    ? 'border-amber-200 dark:border-amber-900' 
    : 'border-blue-200 dark:border-blue-900';
  const statusColor = type === 'incoming' ? 'text-amber-600' : 'text-blue-600';

  return (
    <div className={`flex items-center gap-3 p-3 bg-card rounded-xl border ${borderClass}`}>
      <Avatar className="w-12 h-12 border border-border/50">
        <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground">
          {profile.display_name?.[0]?.toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate">{profile.display_name || 'Unknown User'}</div>
        <div className={`text-xs ${statusColor} font-medium flex items-center gap-1`}>
          <Clock className="w-3 h-3" /> Pending
        </div>
      </div>

      {type === 'incoming' && onAccept && onReject && (
        <div className="flex gap-1">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950" 
            onClick={() => onReject(request.id)} 
            disabled={isRejecting}
          >
            {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
          <Button 
            size="sm" 
            className="h-8" 
            onClick={() => onAccept(request.id)} 
            disabled={isAccepting}
          >
            {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {type === 'outgoing' && onCancel && (
        <Button 
          size="sm" 
          variant="outline" 
          className="text-xs h-8" 
          onClick={() => onCancel(request.id)} 
          disabled={isCancelling}
        >
          {isCancelling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Cancel
        </Button>
      )}
    </div>
  );
}
