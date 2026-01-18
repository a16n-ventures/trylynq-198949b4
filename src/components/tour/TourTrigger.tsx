import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TourTriggerProps {
  onClick: () => void;
  className?: string;
}

export function TourTrigger({ onClick, className }: TourTriggerProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className={className}
          >
            <HelpCircle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Start Tour</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
