import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar, Filter, Tag, MapPin, Ticket, X } from 'lucide-react';

export type DateFilter = 'any' | 'today' | 'week' | 'month';
export type PriceFilter = 'any' | 'free' | 'paid';

export interface EventFilters {
  date: DateFilter;
  category: string; // 'any' or specific
  maxDistanceKm: number; // 5..25
  price: PriceFilter;
}

export const defaultFilters: EventFilters = {
  date: 'any',
  category: 'any',
  maxDistanceKm: 25,
  price: 'any',
};

const CATEGORIES = ['any', 'music', 'nightlife', 'tech', 'sports', 'food', 'art', 'business', 'community'];

interface Props {
  value: EventFilters;
  onChange: (next: EventFilters) => void;
  className?: string;
}

export const EventFilterBar = ({ value, onChange, className = '' }: Props) => {
  const activeCount = [
    value.date !== 'any',
    value.category !== 'any',
    value.price !== 'any',
    value.maxDistanceKm < 25,
  ].filter(Boolean).length;

  const reset = () => onChange(defaultFilters);

  return (
    <div className={`flex items-center gap-2 overflow-x-auto scrollbar-hide ${className}`}>
      {/* Date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={value.date !== 'any' ? 'default' : 'outline'} className="rounded-full h-8 px-3 gap-1 shrink-0">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold capitalize">
              {value.date === 'any' ? 'When' : value.date}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2">
          {(['any', 'today', 'week', 'month'] as DateFilter[]).map((d) => (
            <button
              key={d}
              onClick={() => onChange({ ...value, date: d })}
              className={`w-full text-left px-3 py-2 rounded-md text-sm capitalize ${value.date === d ? 'bg-primary text-white' : 'hover:bg-accent'}`}
            >
              {d === 'any' ? 'Any time' : d === 'week' ? 'This week' : d === 'month' ? 'This month' : 'Today'}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Category */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={value.category !== 'any' ? 'default' : 'outline'} className="rounded-full h-8 px-3 gap-1 shrink-0">
            <Tag className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold capitalize">{value.category === 'any' ? 'Category' : value.category}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2 max-h-72 overflow-y-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ ...value, category: c })}
              className={`w-full text-left px-3 py-2 rounded-md text-sm capitalize ${value.category === c ? 'bg-primary text-white' : 'hover:bg-accent'}`}
            >
              {c === 'any' ? 'All categories' : c}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Price */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={value.price !== 'any' ? 'default' : 'outline'} className="rounded-full h-8 px-3 gap-1 shrink-0">
            <Ticket className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold capitalize">{value.price === 'any' ? 'Price' : value.price}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-2">
          {(['any', 'free', 'paid'] as PriceFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => onChange({ ...value, price: p })}
              className={`w-full text-left px-3 py-2 rounded-md text-sm capitalize ${value.price === p ? 'bg-primary text-white' : 'hover:bg-accent'}`}
            >
              {p === 'any' ? 'Any price' : p}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Distance */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={value.maxDistanceKm < 25 ? 'default' : 'outline'} className="rounded-full h-8 px-3 gap-1 shrink-0">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{value.maxDistanceKm}km</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3">
          <p className="text-xs font-semibold mb-3">Within {value.maxDistanceKm}km</p>
          <Slider
            min={5}
            max={25}
            step={1}
            value={[value.maxDistanceKm]}
            onValueChange={([v]) => onChange({ ...value, maxDistanceKm: v })}
          />
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button size="sm" variant="ghost" className="rounded-full h-8 px-3 gap-1 shrink-0 text-muted-foreground" onClick={reset}>
          <X className="w-3.5 h-3.5" />
          <span className="text-xs">Clear</span>
        </Button>
      )}
    </div>
  );
};

export const applyEventFilters = <T extends { start_date: string; category?: string | null; ticket_price?: number | null; distanceKm?: number | null }>(
  events: T[],
  f: EventFilters,
): T[] => {
  const now = new Date();
  const inDate = (d: Date) => {
    if (f.date === 'any') return true;
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return false;
    if (f.date === 'today') return d.toDateString() === now.toDateString();
    if (f.date === 'week') return diffMs <= 7 * 86400_000;
    if (f.date === 'month') return diffMs <= 31 * 86400_000;
    return true;
  };
  return events.filter((e) => {
    if (!inDate(new Date(e.start_date))) return false;
    if (f.category !== 'any' && (e.category || '').toLowerCase() !== f.category) return false;
    if (f.price === 'free' && (e.ticket_price || 0) > 0) return false;
    if (f.price === 'paid' && (e.ticket_price || 0) <= 0) return false;
    if (e.distanceKm != null && e.distanceKm > f.maxDistanceKm) return false;
    return true;
  });
};
