
-- 1. Fix active_user_locations view: change from SECURITY DEFINER to SECURITY INVOKER
-- so it respects user_locations RLS policies
DROP VIEW IF EXISTS public.active_user_locations;
CREATE VIEW public.active_user_locations
WITH (security_invoker = true)
AS
SELECT ul.user_id,
    ul.latitude,
    ul.longitude,
    ul.is_sharing_location,
    ul.updated_at,
    p.display_name,
    p.avatar_url
FROM user_locations ul
JOIN profiles p ON p.user_id = ul.user_id
WHERE ul.is_sharing_location = true AND ul.updated_at > (now() - '01:00:00'::interval);

-- 2. Fix public_profiles view: change to SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT user_id,
    display_name,
    avatar_url,
    bio,
    created_at
FROM profiles;
