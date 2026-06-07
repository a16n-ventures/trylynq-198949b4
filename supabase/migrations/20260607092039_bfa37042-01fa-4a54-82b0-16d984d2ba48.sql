
-- Admin user activity stats (SECURITY DEFINER bypasses RLS for admin reads)
CREATE OR REPLACE FUNCTION public.get_admin_user_activity_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_banned int;
  v_active_today int;
  v_active_now int;
  v_since_24h timestamptz := now() - interval '24 hours';
  v_since_5m  timestamptz := now() - interval '5 minutes';
BEGIN
  -- Authorization: admin or super_admin only
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles;
  SELECT count(*) INTO v_banned FROM public.profiles WHERE is_banned = true;

  WITH active_today AS (
    SELECT user_id FROM public.user_locations WHERE updated_at >= v_since_24h AND user_id IS NOT NULL
    UNION
    SELECT sender_id FROM public.messages WHERE created_at >= v_since_24h AND sender_id IS NOT NULL
    UNION
    SELECT user_id FROM public.social_posts WHERE created_at >= v_since_24h AND user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.post_comments WHERE created_at >= v_since_24h AND user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.event_attendees WHERE created_at >= v_since_24h AND user_id IS NOT NULL
    UNION
    SELECT creator_id FROM public.events WHERE created_at >= v_since_24h AND creator_id IS NOT NULL
    UNION
    SELECT user_id FROM public.checkins WHERE created_at >= v_since_24h AND user_id IS NOT NULL
  )
  SELECT count(DISTINCT user_id) INTO v_active_today FROM active_today;

  WITH active_now AS (
    SELECT user_id FROM public.user_locations WHERE updated_at >= v_since_5m AND user_id IS NOT NULL
    UNION
    SELECT sender_id FROM public.messages WHERE created_at >= v_since_5m AND sender_id IS NOT NULL
    UNION
    SELECT user_id FROM public.checkins WHERE created_at >= v_since_5m AND user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.social_posts WHERE created_at >= v_since_5m AND user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.post_comments WHERE created_at >= v_since_5m AND user_id IS NOT NULL
  )
  SELECT count(DISTINCT user_id) INTO v_active_now FROM active_now;

  RETURN jsonb_build_object(
    'total', v_total,
    'banned', v_banned,
    'activeToday', v_active_today,
    'activeNow', v_active_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_user_activity_stats() TO authenticated;

-- Ghost mode: single source of truth, syncs profiles.preferences AND user_locations.is_sharing_location
CREATE OR REPLACE FUNCTION public.set_ghost_mode(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefs jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT coalesce(preferences, '{}'::jsonb) INTO v_prefs FROM public.profiles WHERE user_id = v_uid;

  UPDATE public.profiles
     SET preferences = coalesce(v_prefs, '{}'::jsonb) || jsonb_build_object('ghost_mode', _enabled)
   WHERE user_id = v_uid;

  INSERT INTO public.user_locations (user_id, is_sharing_location, updated_at)
       VALUES (v_uid, NOT _enabled, now())
  ON CONFLICT (user_id)
  DO UPDATE SET is_sharing_location = EXCLUDED.is_sharing_location,
                updated_at = now();

  RETURN _enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ghost_mode(boolean) TO authenticated;
