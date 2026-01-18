import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

interface TourGuideProps {
  steps: TourStep[];
  isActive: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

export function TourGuide({
  steps,
  isActive,
  currentStep,
  onNext,
  onPrev,
  onSkip,
  onComplete
}: TourGuideProps) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    if (!isActive || !step) return;

    const updatePosition = () => {
      const element = document.querySelector(step.target);
      if (!element) {
        // If element not found, try again after a short delay
        setTimeout(updatePosition, 100);
        return;
      }

      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      setPosition({
        top: rect.top + scrollTop,
        left: rect.left + scrollLeft,
        width: rect.width,
        height: rect.height
      });

      // Calculate tooltip position based on placement
      const tooltipWidth = 320;
      const tooltipHeight = 180;
      const padding = 16;
      const placement = step.placement || 'bottom';

      let tooltipTop = rect.top + scrollTop;
      let tooltipLeft = rect.left + scrollLeft;

      switch (placement) {
        case 'top':
          tooltipTop = rect.top + scrollTop - tooltipHeight - padding;
          tooltipLeft = rect.left + scrollLeft + (rect.width / 2) - (tooltipWidth / 2);
          break;
        case 'bottom':
          tooltipTop = rect.bottom + scrollTop + padding;
          tooltipLeft = rect.left + scrollLeft + (rect.width / 2) - (tooltipWidth / 2);
          break;
        case 'left':
          tooltipTop = rect.top + scrollTop + (rect.height / 2) - (tooltipHeight / 2);
          tooltipLeft = rect.left + scrollLeft - tooltipWidth - padding;
          break;
        case 'right':
          tooltipTop = rect.top + scrollTop + (rect.height / 2) - (tooltipHeight / 2);
          tooltipLeft = rect.right + scrollLeft + padding;
          break;
      }

      // Keep tooltip within viewport
      tooltipLeft = Math.max(padding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - padding));
      tooltipTop = Math.max(padding, Math.min(tooltipTop, window.innerHeight + scrollTop - tooltipHeight - padding));

      setTooltipPosition({ top: tooltipTop, left: tooltipLeft });

      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isActive, step, currentStep]);

  if (!isActive || !step) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[9998] transition-opacity duration-300"
        onClick={onSkip}
      />

      {/* Spotlight / Highlight */}
      <div
        className="fixed z-[9999] pointer-events-none transition-all duration-300"
        style={{
          top: position.top - 8,
          left: position.left - 8,
          width: position.width + 16,
          height: position.height + 16,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          borderRadius: '12px',
        }}
      />

      {/* Tooltip Card */}
      <Card
        ref={tooltipRef}
        className="fixed z-[10000] w-80 shadow-2xl border-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{step.title}</h3>
                <p className="text-[10px] text-muted-foreground">
                  Step {currentStep + 1} of {steps.length}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-1 -mt-1"
              onClick={onSkip}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {step.description}
          </p>

          {/* Progress Bar */}
          <div className="flex gap-1 mb-4">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index <= currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-muted-foreground"
            >
              Skip tour
            </Button>

            <div className="flex gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrev}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}

              <Button
                size="sm"
                onClick={isLastStep ? onComplete : onNext}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
