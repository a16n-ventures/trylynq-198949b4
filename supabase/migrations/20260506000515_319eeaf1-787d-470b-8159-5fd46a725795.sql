
-- 1. handle_new_user: also create default user_roles row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, username, phone)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.email
    ),
    NEW.email,
    NEW.raw_user_meta_data ->> 'username',
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    email = COALESCE(EXCLUDED.email, profiles.email),
    username = COALESCE(EXCLUDED.username, profiles.username),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = now();

  -- Default 'user' role so RLS / UI doesn't flicker
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill existing users missing the default role
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'user'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Friend request / accept notifications
CREATE OR REPLACE FUNCTION public.notify_friendship_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  requester_name TEXT;
  addressee_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(display_name, username, 'Someone') INTO requester_name
      FROM public.profiles WHERE user_id = NEW.requester_id;

    INSERT INTO public.notifications (user_id, sender_id, type, title, message, metadata)
    VALUES (
      NEW.addressee_id,
      NEW.requester_id,
      'friend_request',
      'New friend request',
      COALESCE(requester_name, 'Someone') || ' sent you a friend request',
      jsonb_build_object('friendship_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
    SELECT COALESCE(display_name, username, 'Someone') INTO addressee_name
      FROM public.profiles WHERE user_id = NEW.addressee_id;

    INSERT INTO public.notifications (user_id, sender_id, type, title, message, metadata)
    VALUES (
      NEW.requester_id,
      NEW.addressee_id,
      'friend_accepted',
      'Friend request accepted',
      COALESCE(addressee_name, 'Someone') || ' accepted your friend request',
      jsonb_build_object('friendship_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendship_notify_insert ON public.friendships;
CREATE TRIGGER friendship_notify_insert
AFTER INSERT ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.notify_friendship_change();

DROP TRIGGER IF EXISTS friendship_notify_update ON public.friendships;
CREATE TRIGGER friendship_notify_update
AFTER UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.notify_friendship_change();

-- 3. Foreign keys to profiles for PostgREST embeds (events + attendees)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_creator_profile_fkey') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_creator_profile_fkey
      FOREIGN KEY (creator_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_attendees_user_profile_fkey') THEN
    ALTER TABLE public.event_attendees
      ADD CONSTRAINT event_attendees_user_profile_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;
