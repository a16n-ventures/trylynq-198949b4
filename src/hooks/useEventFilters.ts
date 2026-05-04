import { useEffect, useState } from 'react';
import { defaultFilters, type EventFilters } from '@/components/events/EventFilterBar';

const KEY = 'ahmia.eventFilters.v1';

const read = (): EventFilters => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultFilters;
    return { ...defaultFilters, ...(JSON.parse(raw) as Partial<EventFilters>) };
  } catch {
    return defaultFilters;
  }
};

/**
 * Shared, persisted event filter state — keeps Map and Events in sync.
 */
export function useEventFilters() {
  const [filters, setFilters] = useState<EventFilters>(read);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(filters)); } catch {}
    // Cross-tab / cross-page sync within this session
    window.dispatchEvent(new CustomEvent('ahmia:event-filters', { detail: filters }));
  }, [filters]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setFilters(read());
    };
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<EventFilters>).detail;
      if (next) setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('ahmia:event-filters', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('ahmia:event-filters', onCustom as EventListener);
    };
  }, []);

  return [filters, setFilters] as const;
}
