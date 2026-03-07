
-- Profile views tracking table
CREATE TABLE public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- One view per viewer per profile per day
CREATE UNIQUE INDEX idx_profile_views_unique_daily 
  ON public.profile_views (profile_user_id, viewer_id, view_date);

-- Event views tracking table
CREATE TABLE public.event_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_event_views_unique_daily 
  ON public.event_views (event_id, viewer_id, view_date);

-- RLS
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert profile views"
  ON public.profile_views FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Profile owners can view their views"
  ON public.profile_views FOR SELECT TO authenticated
  USING (profile_user_id = auth.uid());

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert event views"
  ON public.event_views FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Event creators can view their event views"
  ON public.event_views FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_views.event_id AND e.creator_id = auth.uid()
  ));

-- Record profile view RPC
CREATE OR REPLACE FUNCTION public.record_profile_view(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  view_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = target_user_id THEN
    SELECT COUNT(*) INTO view_count FROM profile_views 
    WHERE profile_user_id = target_user_id AND viewed_at > now() - interval '30 days';
    RETURN view_count;
  END IF;

  INSERT INTO profile_views (profile_user_id, viewer_id, view_date, viewed_at)
  VALUES (target_user_id, auth.uid(), CURRENT_DATE, now())
  ON CONFLICT (profile_user_id, viewer_id, view_date) DO NOTHING;

  SELECT COUNT(*) INTO view_count FROM profile_views 
  WHERE profile_user_id = target_user_id AND viewed_at > now() - interval '30 days';

  UPDATE profiles SET profile_views_30d = view_count WHERE user_id = target_user_id;
  RETURN view_count;
END;
$$;

-- Record event view RPC
CREATE OR REPLACE FUNCTION public.record_event_view(target_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  view_count integer;
  event_creator uuid;
BEGIN
  SELECT creator_id INTO event_creator FROM events WHERE id = target_event_id;

  IF auth.uid() IS NULL OR auth.uid() = event_creator THEN
    SELECT COUNT(*) INTO view_count FROM event_views 
    WHERE event_id = target_event_id AND viewed_at > now() - interval '30 days';
    RETURN view_count;
  END IF;

  INSERT INTO event_views (event_id, viewer_id, view_date, viewed_at)
  VALUES (target_event_id, auth.uid(), CURRENT_DATE, now())
  ON CONFLICT (event_id, viewer_id, view_date) DO NOTHING;

  SELECT COUNT(*) INTO view_count FROM event_views 
  WHERE event_id = target_event_id AND viewed_at > now() - interval '30 days';

  UPDATE events SET event_views_30d = view_count WHERE id = target_event_id;
  RETURN view_count;
END;
$$;
