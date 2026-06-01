
-- 1) Fix suggest_nearby_friends: use profiles.user_id + user_locations + friendships(requester_id/addressee_id)
-- Ordering strictly: proximity → mutual connections → interest overlap.
CREATE OR REPLACE FUNCTION public.suggest_nearby_friends(
  p_user_id uuid,
  p_lat double precision,
  p_long double precision,
  p_city text DEFAULT '',
  p_is_premium boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  distance_km double precision,
  mutual_count bigint,
  is_new_user boolean,
  common_interests text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_my_interests text[];
  v_my_friends   uuid[];
  v_max_km       double precision := CASE WHEN p_is_premium THEN 75.0 ELSE 25.0 END;
BEGIN
  -- caller interests
  SELECT COALESCE(pr.interests, '{}') INTO v_my_interests
  FROM profiles pr WHERE pr.user_id = p_user_id;
  IF v_my_interests IS NULL THEN v_my_interests := '{}'; END IF;

  -- caller's friend ids (accepted or pending)
  SELECT COALESCE(ARRAY_AGG(
    CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END
  ), '{}')
  INTO v_my_friends
  FROM friendships f
  WHERE f.requester_id = p_user_id OR f.addressee_id = p_user_id;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.created_at,
      COALESCE(p.interests, '{}'::text[]) AS interests,
      ROUND(
        (ST_Distance(
           ST_MakePoint(p_long, p_lat)::geography,
           ST_MakePoint(ul.longitude, ul.latitude)::geography
        ) / 1000.0)::numeric, 2
      )::double precision AS distance_km
    FROM profiles p
    JOIN user_locations ul ON ul.user_id = p.user_id
    WHERE p.user_id <> p_user_id
      AND NOT (p.user_id = ANY(v_my_friends))
      AND ul.latitude IS NOT NULL
      AND ul.longitude IS NOT NULL
  ),
  scored AS (
    SELECT
      c.*,
      (
        SELECT COUNT(*)::bigint FROM (
          SELECT CASE WHEN f.requester_id = c.user_id THEN f.addressee_id ELSE f.requester_id END AS fid
          FROM friendships f
          WHERE (f.requester_id = c.user_id OR f.addressee_id = c.user_id)
            AND f.status = 'accepted'
          INTERSECT
          SELECT UNNEST(v_my_friends)
        ) m
      ) AS mutual_count,
      ARRAY(
        SELECT UNNEST(c.interests) INTERSECT SELECT UNNEST(v_my_interests)
      ) AS shared_interests,
      (c.created_at > NOW() - INTERVAL '7 days') AS is_new
    FROM candidates c
    WHERE c.distance_km <= v_max_km
  )
  SELECT
    s.user_id,
    s.username,
    s.display_name,
    s.avatar_url,
    s.distance_km,
    s.mutual_count,
    s.is_new,
    s.shared_interests
  FROM scored s
  ORDER BY
    s.distance_km ASC,
    s.mutual_count DESC,
    CARDINALITY(s.shared_interests) DESC,
    s.created_at DESC
  LIMIT 20;
END;
$function$;

-- 2) Notify event creator on RSVP / join request
CREATE OR REPLACE FUNCTION public.notify_event_creator_on_rsvp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_title   text;
  v_actor   text;
BEGIN
  -- skip self-RSVPs
  SELECT e.creator_id, e.title INTO v_creator, v_title
  FROM events e WHERE e.id = NEW.event_id;

  IF v_creator IS NULL OR v_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username, 'Someone') INTO v_actor
  FROM profiles WHERE user_id = NEW.user_id;

  INSERT INTO notifications (user_id, type, title, message, sender_id, metadata)
  VALUES (
    v_creator,
    CASE WHEN NEW.status = 'confirmed' THEN 'event_rsvp' ELSE 'event_join_request' END,
    CASE WHEN NEW.status = 'confirmed' THEN 'New RSVP' ELSE 'Join request' END,
    COALESCE(v_actor, 'Someone') ||
      CASE WHEN NEW.status = 'confirmed'
        THEN ' is going to "' || COALESCE(v_title,'your event') || '"'
        ELSE ' requested to join "' || COALESCE(v_title,'your event') || '"'
      END,
    NEW.user_id,
    jsonb_build_object('event_id', NEW.event_id, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_creator_on_rsvp ON public.event_attendees;
CREATE TRIGGER trg_notify_event_creator_on_rsvp
AFTER INSERT ON public.event_attendees
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_creator_on_rsvp();
