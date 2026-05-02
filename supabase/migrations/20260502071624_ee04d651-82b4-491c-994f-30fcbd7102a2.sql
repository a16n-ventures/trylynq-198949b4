INSERT INTO public.event_locations (event_id, latitude, longitude, location_name, formatted_address, created_at, updated_at)
SELECT
  e.id,
  cm.center_lat,
  cm.center_long,
  cm.city_name,
  cm.city_name,
  now(),
  now()
FROM public.events e
JOIN public.city_milestones cm
  ON e.title ILIKE '%' || cm.city_name || '%'
  OR e.title ILIKE '%' || split_part(cm.city_name, ' ', array_length(string_to_array(cm.city_name, ' '), 1)) || '%'
WHERE e.start_date > now()
  AND e.is_public = true
  AND NOT EXISTS (
    SELECT 1 FROM public.event_locations el WHERE el.event_id = e.id
  );