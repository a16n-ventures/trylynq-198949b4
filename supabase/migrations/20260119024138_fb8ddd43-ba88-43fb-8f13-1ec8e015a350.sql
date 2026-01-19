-- Insert Communities (Spotlight Content)
INSERT INTO communities (name, description, creator_id, cover_url, member_count)
VALUES 
(
  'Lagos Tech Bros', 
  'The official community for developers, founders, and tech enthusiasts in Lagos. Weekly meetups and job postings.',
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998',
  1240
),
(
  'Abuja Nightlife', 
  'Discover the best parties, lounges, and vibes in the capital city. VIP access only.',
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'https://images.unsplash.com/photo-1566737236500-c8ac43014a67',
  850
),
(
  'Ahmia Runners Club', 
  'Saturday morning runs at Ikoyi Link Bridge. All paces welcome. Breakfast after!',
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'https://images.unsplash.com/photo-1552674605-4694c4897e93',
  320
),
(
  'Afro-House Heads', 
  'For the love of Amapiano, Afro-House and deep rhythms. Sharing mixes and events.',
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
  2100
)
ON CONFLICT DO NOTHING;

-- Insert Events (Feed Content)
INSERT INTO events (
  creator_id, 
  title, 
  description, 
  start_date, 
  end_date, 
  location, 
  latitude, 
  longitude, 
  image_url, 
  ticket_price, 
  is_sponsored, 
  match_score,
  recurrence_rule
)
VALUES 
(
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'Davido Timeless Tour: Lagos Finale',
  'The biggest concert of the year returns to Eko Hotel. Experience the Timeless album live with special guest performances.',
  (now() + interval '2 days' + interval '19 hours'),
  (now() + interval '2 days' + interval '23 hours'),
  'Eko Hotel & Suites, Victoria Island',
  6.4253, 3.4219,
  'https://images.unsplash.com/photo-1493225255756-d9584f8606e9',
  25000,
  true,
  98,
  NULL
),
(
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'Mainland Block Party: Island Invasion',
  'The mainland vibe is coming to the island. Food, drinks, and non-stop energy. 18+ only.',
  (now() + interval '5 days' + interval '16 hours'),
  (now() + interval '5 days' + interval '22 hours'),
  'Muri Okunola Park, Lagos',
  6.4312, 3.4250,
  'https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9',
  5000,
  false,
  85,
  'MONTHLY'
),
(
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'Tech & Tequila Mixer',
  'Networking for founders and VCs. Come pitch your startup or just enjoy the open bar.',
  (now() + interval '1 day' + interval '18 hours'),
  (now() + interval '1 day' + interval '21 hours'),
  'Kapadoccia, Abuja',
  9.0579, 7.4951,
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
  0,
  false,
  92,
  NULL
),
(
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'Sunday Beach Yoga',
  'Start your Sunday with mindfulness and ocean breeze. Mats provided.',
  (now() + interval '3 days' + interval '8 hours'),
  (now() + interval '3 days' + interval '10 hours'),
  'Landmark Beach, Lagos',
  6.4200, 3.4350,
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773',
  2000,
  false,
  75,
  'WEEKLY'
),
(
  'd99ceb17-caa9-4baf-b1d9-8abacf600cdc',
  'Art X Exhibition Opening',
  'Showcasing contemporary African art. Meet the artists and collectors.',
  (now() + interval '6 days' + interval '17 hours'),
  (now() + interval '6 days' + interval '21 hours'),
  'Federal Palace Hotel, Lagos',
  6.4280, 3.4150,
  'https://images.unsplash.com/photo-1536924940846-227afb31e2a5',
  10000,
  true,
  88,
  NULL
)
ON CONFLICT DO NOTHING;