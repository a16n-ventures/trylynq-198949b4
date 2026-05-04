-- Ticket tiers for events
CREATE TABLE IF NOT EXISTS public.event_ticket_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  capacity integer,
  sold_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_ticket_tiers_event_id ON public.event_ticket_tiers(event_id);

ALTER TABLE public.event_ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tiers of public events"
ON public.event_ticket_tiers FOR SELECT
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_ticket_tiers.event_id AND e.is_public = true));

CREATE POLICY "Event creators manage tiers"
ON public.event_ticket_tiers FOR ALL
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_ticket_tiers.event_id AND e.creator_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_ticket_tiers.event_id AND e.creator_id = auth.uid()));

-- Track which tier was purchased on attendance
ALTER TABLE public.event_attendees
  ADD COLUMN IF NOT EXISTS ticket_tier_id uuid REFERENCES public.event_ticket_tiers(id) ON DELETE SET NULL;

CREATE TRIGGER trg_event_ticket_tiers_updated
BEFORE UPDATE ON public.event_ticket_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();