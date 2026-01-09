-- Insert admin role for the current user (replace with actual user_id after they authenticate)
-- This creates a helper function to make a user an admin
CREATE OR REPLACE FUNCTION public.make_user_admin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.make_user_admin(uuid) TO authenticated;

-- Create a policy that only super_admins can call this function (if needed in future)
-- For now, the function is available to authenticated users for initial setup