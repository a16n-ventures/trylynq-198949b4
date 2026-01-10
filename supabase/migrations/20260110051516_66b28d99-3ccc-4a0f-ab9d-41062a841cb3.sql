-- Fix make_user_admin to work for first admin bootstrap
-- Drop and recreate with SECURITY DEFINER to bypass RLS
DROP FUNCTION IF EXISTS public.make_user_admin(uuid);

CREATE OR REPLACE FUNCTION public.make_user_admin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
BEGIN
  -- Count existing admins
  SELECT COUNT(*) INTO admin_count FROM user_roles WHERE role = 'admin';
  
  -- Only allow if no admins exist (bootstrap) OR caller is already an admin
  IF admin_count = 0 OR public.has_role(auth.uid(), 'admin') THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can create other admins';
  END IF;
END;
$$;

-- Fix get_nearby_users to return proper display_name from profiles table
DROP FUNCTION IF EXISTS public.get_nearby_users(uuid, double precision);

CREATE OR REPLACE FUNCTION public.get_nearby_users(p_user_id uuid, p_radius_km double precision DEFAULT 100)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_location AS (
    SELECT latitude, longitude
    FROM user_locations
    WHERE user_locations.user_id = p_user_id
    LIMIT 1
  )
  SELECT 
    ul.user_id,
    COALESCE(p.display_name, 'User' || LEFT(ul.user_id::text, 4)) as display_name,
    p.avatar_url,
    (
      6371 * acos(
        cos(radians((SELECT latitude FROM user_location))) *
        cos(radians(ul.latitude)) *
        cos(radians(ul.longitude) - radians((SELECT longitude FROM user_location))) +
        sin(radians((SELECT latitude FROM user_location))) *
        sin(radians(ul.latitude))
      )
    ) as distance_km
  FROM user_locations ul
  LEFT JOIN profiles p ON p.user_id = ul.user_id
  WHERE ul.user_id != p_user_id
    AND ul.is_sharing_location = true
    AND ul.last_seen > NOW() - INTERVAL '24 hours'
  HAVING (
    6371 * acos(
      cos(radians((SELECT latitude FROM user_location))) *
      cos(radians(ul.latitude)) *
      cos(radians(ul.longitude) - radians((SELECT longitude FROM user_location))) +
      sin(radians((SELECT latitude FROM user_location))) *
      sin(radians(ul.latitude))
    )
  ) <= p_radius_km
  ORDER BY distance_km ASC
  LIMIT 50;
END;
$$;