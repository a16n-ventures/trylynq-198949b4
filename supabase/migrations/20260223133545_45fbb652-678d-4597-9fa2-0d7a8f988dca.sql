-- Reassign all events to the admin user
UPDATE events SET creator_id = 'cac502eb-1185-44b7-a6ae-5dd6a6880617' WHERE creator_id != 'cac502eb-1185-44b7-a6ae-5dd6a6880617';

-- Reassign all communities to the admin user
UPDATE communities SET creator_id = 'cac502eb-1185-44b7-a6ae-5dd6a6880617' WHERE creator_id IS NULL OR creator_id != 'cac502eb-1185-44b7-a6ae-5dd6a6880617';