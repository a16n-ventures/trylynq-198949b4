import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Ticket } from 'lucide-react';
import { useEventTicketTiers, tierAvailability, type TicketTier } from '@/hooks/useEventTickets';
import { formatTicketPrice } from '@/lib/eventFormat';

interface Props {
  eventId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackPrice?: number | null;
  onConfirm: (tier: TicketTier | null) => void;
  selectedTierId?: string | null;
  onSelectTier?: (id: string | null) => void;
  confirmLabel?: string;
}

export const TicketTierSelector = ({
  eventId,
  open,
  onOpenChange,
  fallbackPrice,
  onConfirm,
  selectedTierId,
  onSelectTier,
  confirmLabel,
}: Props) => {
  const { data: tiers = [], isLoading } = useEventTicketTiers(eventId || undefined);

  const effectiveTiers = useMemo<TicketTier[]>(() => {
    if (tiers.length > 0) return tiers;
    if (eventId == null) return [];
    // Synthesize a single default tier from event.ticket_price
    return [{
      id: '__default__',
      event_id: eventId,
      name: (fallbackPrice ?? 0) > 0 ? 'General Admission' : 'Free RSVP',
      price: fallbackPrice ?? 0,
      capacity: null,
      sold_count: 0,
      description: null,
      is_active: true,
      sort_order: 0,
    }];
  }, [tiers, eventId, fallbackPrice]);

  const currentId = selectedTierId ?? effectiveTiers[0]?.id ?? null;
  const current = effectiveTiers.find((t) => t.id === currentId) || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" /> Choose ticket
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <RadioGroup
              value={currentId ?? ''}
              onValueChange={(v) => onSelectTier?.(v)}
              className="space-y-2"
            >
              {effectiveTiers.map((t) => {
                const { remaining, soldOut } = tierAvailability(t);
                const isSelected = t.id === currentId;
                return (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    } ${soldOut ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <RadioGroupItem value={t.id} disabled={soldOut} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm">{t.name}</span>
                        <span className="font-black text-sm">{formatTicketPrice(t.price)}</span>
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        {soldOut ? (
                          <Badge variant="destructive" className="text-[10px]">Sold out</Badge>
                        ) : t.capacity != null ? (
                          <Badge variant="secondary" className="text-[10px]">{remaining} left</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Unlimited</Badge>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          )}
        </div>

        <Button
          className="h-12 w-full rounded-xl text-base font-bold shadow-lg"
          disabled={!current || isLoading}
          onClick={() => onConfirm(current)}
        >
          {confirmLabel ?? (current && current.price > 0 ? `Continue — ${formatTicketPrice(current.price)}` : 'RSVP')}
        </Button>
      </SheetContent>
    </Sheet>
  );
};
