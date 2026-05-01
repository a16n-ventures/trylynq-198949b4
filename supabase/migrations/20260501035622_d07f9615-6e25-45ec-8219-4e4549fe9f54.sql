-- Rewrite generate_smart_feed RPC to use event_locations join
-- (events table no longer has location/latitude/longitude columns)
CREATE OR REPLACE FUNCTION public.generate_smart_feed(
  p_user_id uuid,
  p_user_lat double precision DEFAULT NULL,
  p_user_long double precision DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium boolean;
  v_user_interests text[];
  v_max_dist float;
  v_events jsonb;
  v_communities jsonb;
  v_milestone jsonb;
  v_zone record;
BEGIN
  -- 1. Premium status & interests
  SELECT
    (COALESCE(p.is_premium, false) OR EXISTS (
      SELECT 1 FROM premium_features pf
      WHERE pf.user_id = p_user_id AND pf.is_active = true AND pf.expires_at > now()
    )),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p.preferences->'interests')), ARRAY[]::text[])
  INTO v_is_premium, v_user_interests
  FROM profiles p
  WHERE p.user_id = p_user_id;

  v_max_dist := CASE WHEN v_is_premium THEN 25 ELSE 5 END;

  -- 2. Build events JSON via event_locations join
  WITH friend_ids AS (
    SELECT CASE WHEN requester_id = p_user_id THEN addressee_id ELSE requester_id END as fid
    FROM friendships
    WHERE status = 'accepted' AND (requester_id = p_user_id OR addressee_id = p_user_id)
  ),
  event_pool AS (
    SELECT
      e.*,
      el.location_name as event_location,
      el.latitude as event_lat,
      el.longitude as event_long,
      CASE
        WHEN p_user_lat IS NOT NULL AND p_user_long IS NOT NULL
             AND el.latitude IS NOT NULL AND el.longitude IS NOT NULL
        THEN calculate_distance(p_user_lat, p_user_long, el.latitude, el.longitude)
        ELSE NULL
      END as dist
    FROM events e
    LEFT JOIN event_locations el ON el.event_id = e.id
    WHERE e.start_date > now() AND e.is_public = true
      AND (
        p_city IS NULL
        OR el.location_name ILIKE '%' || p_city || '%'
        OR e.is_official = true
      )
    ORDER BY e.start_date ASC
    LIMIT 50
  ),
  scored_events AS (
    SELECT
      ep.*,
      (SELECT count(*) FROM event_attendees ea WHERE ea.event_id = ep.id) as attendee_count,
      EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = ep.id AND ea.user_id = p_user_id) as is_attending,
      (SELECT COALESCE(jsonb_agg(pr.avatar_url), '[]'::jsonb)
       FROM (
         SELECT pp.avatar_url FROM event_attendees ea
         JOIN profiles pp ON pp.user_id = ea.user_id
         WHERE ea.event_id = ep.id AND ea.user_id IN (SELECT fid FROM friend_ids)
         LIMIT 3
       ) pr) as friend_images,
      EXISTS(
        SELECT 1 FROM premium_features pf
        WHERE pf.user_id = ep.creator_id
          AND pf.feature_type IN ('event_boost','full_package')
          AND pf.is_active = true AND pf.expires_at > now()
      ) as creator_has_boost,
      (
        50
        + CASE WHEN ep.dist IS NOT NULL THEN
            CASE WHEN ep.dist < 25 THEN 10
                 WHEN ep.dist < v_max_dist THEN 10
                 ELSE -10 END
          ELSE 0 END
        + CASE
            WHEN array_length(v_user_interests, 1) > 0
                 AND ep.category ILIKE ANY(SELECT '%' || unnest(v_user_interests) || '%')
            THEN 25 ELSE 5 END
        + CASE WHEN ep.title ILIKE ANY(ARRAY['%owambe%','%party%','%tech%','%lagos%','%abuja%','%vibes%','%cruise%','%wedding%']) THEN 15 ELSE 0 END
      ) as base_score
    FROM event_pool ep
  ),
  final_events AS (
    SELECT
      se.*,
      (se.base_score
        + CASE WHEN se.creator_has_boost THEN
            CASE
              WHEN array_length(v_user_interests, 1) > 0
                   AND se.category ILIKE ANY(SELECT '%' || unnest(v_user_interests) || '%')
              THEN 100 ELSE 50 END
          ELSE 0 END
      ) as raw_score,
      (
        se.creator_has_boost
        AND array_length(v_user_interests, 1) > 0
        AND se.category ILIKE ANY(SELECT '%' || unnest(v_user_interests) || '%')
      ) as is_sponsored
    FROM scored_events se
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', fe.id,
      'title', fe.title,
      'location', fe.event_location,
      'start_date', fe.start_date,
      'end_date', fe.end_date,
      'image_url', fe.image_url,
      'category', fe.category,
      'latitude', fe.event_lat,
      'longitude', fe.event_long,
      'type', 'event',
      'match_score', LEAST(fe.raw_score, 100),
      'raw_score', fe.raw_score,
      'attendee_count', fe.attendee_count,
      'is_attending', fe.is_attending,
      'friend_images', fe.friend_images,
      'is_sponsored', fe.is_sponsored,
      'creator_id', fe.creator_id,
      'ticket_price', fe.ticket_price,
      'description', fe.description
    ) ORDER BY fe.raw_score DESC
  ), '[]'::jsonb) INTO v_events
  FROM final_events fe;

  -- 3. Communities
  WITH comm_pool AS (
    SELECT c.*,
      (SELECT count(*) FROM community_members cm WHERE cm.community_id = c.id) as member_count,
      EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = p_user_id) as is_member
    FROM communities c
    ORDER BY c.created_at DESC
    LIMIT 50
  ),
  scored_comms AS (
    SELECT cp.*,
      (40
        + CASE WHEN cp.is_member THEN 30 ELSE 0 END
        + CASE WHEN v_is_premium AND (cp.name ILIKE '%Exclusive%' OR cp.name ILIKE '%Premium%') THEN 20 ELSE 0 END
      ) as match_score
    FROM comm_pool cp
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'description', sc.description,
      'cover_url', sc.cover_url,
      'member_count', sc.member_count,
      'is_premium', sc.is_premium,
      'join_fee', sc.join_fee,
      'is_member', sc.is_member,
      'match_score', sc.match_score
    ) ORDER BY sc.match_score DESC
  ), '[]'::jsonb) INTO v_communities
  FROM scored_comms sc;

  -- 4. Milestone (nearest city_milestone within radius)
  v_milestone := jsonb_build_object('zone_name', NULL, 'current', 0, 'target', 0, 'is_unlocked', false);
  IF p_user_lat IS NOT NULL AND p_user_long IS NOT NULL THEN
    SELECT cm.* INTO v_zone
    FROM city_milestones cm
    WHERE calculate_distance(p_user_lat, p_user_long, cm.center_lat, cm.center_long) <= COALESCE(cm.radius_km, 25)
    ORDER BY calculate_distance(p_user_lat, p_user_long, cm.center_lat, cm.center_long) ASC
    LIMIT 1;

    IF FOUND THEN
      v_milestone := jsonb_build_object(
        'zone_name', v_zone.city_name,
        'current', COALESCE(v_zone.current_count, 0),
        'target', COALESCE(v_zone.target_count, 0),
        'is_unlocked', COALESCE(v_zone.is_unlocked, false),
        'is_launch_zone', true
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'events', v_events,
    'communities', v_communities,
    'milestone', v_milestone
  );
END;
$$;