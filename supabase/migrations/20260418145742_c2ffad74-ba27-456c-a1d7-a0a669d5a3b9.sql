UPDATE public.events
SET latitude = 11.1561, longitude = 7.6892
WHERE location ILIKE '%zaria%' AND (latitude IS NULL OR longitude IS NULL);