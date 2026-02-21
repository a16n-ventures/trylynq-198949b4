import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Nigerian cities with coordinates for seed events
const NIGERIAN_CITIES = [
  { name: 'Lagos', lat: 6.5244, lng: 3.3792, state: 'Lagos' },
  { name: 'Abuja', lat: 9.0579, lng: 7.4951, state: 'FCT' },
  { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498, state: 'Rivers' },
  { name: 'Ibadan', lat: 7.3775, lng: 3.9470, state: 'Oyo' },
  { name: 'Kano', lat: 12.0022, lng: 8.5920, state: 'Kano' },
  { name: 'Enugu', lat: 6.4584, lng: 7.5464, state: 'Enugu' },
  { name: 'Kaduna', lat: 10.5105, lng: 7.4165, state: 'Kaduna' },
  { name: 'Benin City', lat: 6.3350, lng: 5.6270, state: 'Edo' },
  { name: 'Calabar', lat: 4.9517, lng: 8.3220, state: 'Cross River' },
  { name: 'Warri', lat: 5.5167, lng: 5.7500, state: 'Delta' },
  { name: 'Uyo', lat: 5.0510, lng: 7.9336, state: 'Akwa Ibom' },
  { name: 'Abeokuta', lat: 7.1475, lng: 3.3619, state: 'Ogun' },
  { name: 'Jos', lat: 9.8965, lng: 8.8583, state: 'Plateau' },
  { name: 'Owerri', lat: 5.4836, lng: 7.0333, state: 'Imo' },
  { name: 'Asaba', lat: 6.1987, lng: 6.7333, state: 'Delta' },
];

// Event templates per category for realistic generation
const EVENT_TEMPLATES = [
  { category: 'Music', titles: ['Afrobeats Night Live', 'Amapiano Sunday Session', 'Jazz & Jollof Evening', 'Gospel Concert', 'DJ Battle Royale', 'Highlife Heritage Night'], price_range: [0, 15000] },
  { category: 'Party', titles: ['All White Pool Party', 'Neon Glow Night', 'Owambe Saturday Special', 'Rooftop Sunset Party', 'Beach Rave', 'Day Party Brunch'], price_range: [2000, 20000] },
  { category: 'Tech', titles: ['Tech & Tequila Mixer', 'AI/ML Workshop', 'Startup Pitch Night', 'Web3 Builders Meetup', 'DevFest Afterparty', 'Product Design Sprint'], price_range: [0, 5000] },
  { category: 'Sports', titles: ['Morning Run Club', 'Beach Volleyball Tournament', 'Sunday Football League', 'Fitness Bootcamp', 'Cycling Challenge', 'Yoga in the Park'], price_range: [0, 3000] },
  { category: 'Arts', titles: ['Art Exhibition Opening', 'Pottery Workshop', 'Photography Walk', 'Spoken Word & Poetry Night', 'Film Screening & Discussion', 'Fashion Show Preview'], price_range: [0, 10000] },
  { category: 'Food', titles: ['Food Festival', 'Suya & Cocktails Night', 'Cooking Masterclass', 'Wine Tasting Experience', 'Street Food Tour', 'Brunch & Mimosas'], price_range: [1500, 8000] },
  { category: 'Networking', titles: ['Young Professionals Mixer', 'Women in Business Meetup', 'Founders Friday', 'Career Fair', 'Industry Connect', 'Mentorship Circle'], price_range: [0, 5000] },
];

// Venues per city for realism
const VENUES: Record<string, string[]> = {
  'Lagos': ['Eko Hotel, Victoria Island', 'Landmark Beach', 'Muri Okunola Park', 'Terra Kulture', 'Federal Palace Hotel', 'The Palms Shopping Mall', 'Lekki Conservation Centre'],
  'Abuja': ['Transcorp Hilton', 'Jabi Lake Mall', 'Millennium Park', 'Nile University Hall', 'Kapadoccia Lounge', 'Ceddi Plaza'],
  'Port Harcourt': ['Hotel Presidential', 'Pleasure Park', 'Genesis Deluxe Cinemas', 'Azubia Mall'],
  'Ibadan': ['Ventura Mall', 'Agodi Gardens', 'University of Ibadan Conference Centre'],
  'Kano': ['Tahir Guest Palace', 'Kano Polo Club', 'Ado Bayero Mall'],
  'Enugu': ['Polo Park Mall', 'Nike Lake Resort', 'Genesis Deluxe Cinemas Enugu'],
  'Kaduna': ['Hamdala Hotel', 'Kaduna Polo Club', 'Barnawa Sports Club'],
  'Benin City': ['Protea Hotel', 'Ogba Zoo Gardens', 'University of Benin Hall'],
  'Calabar': ['Tinapa Resort', 'Calabar Cultural Centre', 'Transcorp Calabar'],
  'Warri': ['Essen Hotel', 'Warri City Stadium Area', 'PTI Conference Centre'],
  'Uyo': ['Ibom Hotel & Golf Resort', 'Ibom Tropicana', 'Le Meridien Ibom'],
  'Abeokuta': ['Olumo Rock Resort', 'FUNAAB Conference Centre'],
  'Jos': ['Hill Station Hotel', 'Jos Wildlife Park', 'Lamingo Dam Area'],
  'Owerri': ['Owerri Mall', 'Imo State Cultural Centre', 'Rockview Hotels'],
  'Asaba': ['Grand Hotel Asaba', 'Delta State Events Centre'],
};

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomPrice(range: number[]): number {
  if (Math.random() < 0.3) return 0; // 30% chance of free
  return Math.round((range[0] + Math.random() * (range[1] - range[0])) / 500) * 500;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("🕵️ Starting Nigerian Cities Event Generation...")

    // Get a valid creator_id
    const { data: profileData } = await supabase.from('profiles').select('user_id').limit(1).single();
    const fallbackCreatorId = profileData?.user_id;
    if (!fallbackCreatorId) {
      return new Response(JSON.stringify({ error: 'No users found to assign as creator' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check existing events to avoid flooding
    const { count: existingCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gt('start_date', new Date().toISOString());

    // Only generate if we have fewer than 30 upcoming events
    if (existingCount && existingCount >= 30) {
      return new Response(JSON.stringify({
        success: true,
        message: `Already have ${existingCount} upcoming events. Skipping generation.`,
        generated: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const generatedEvents: any[] = [];
    const now = new Date();

    // Generate 2-4 events per city
    for (const city of NIGERIAN_CITIES) {
      const eventsForCity = 2 + Math.floor(Math.random() * 3); // 2-4 events

      for (let i = 0; i < eventsForCity; i++) {
        const template = getRandomItem(EVENT_TEMPLATES);
        const title = getRandomItem(template.titles);
        const cityVenues = VENUES[city.name] || [`${city.name} Event Centre`];
        const venue = getRandomItem(cityVenues);

        // Random date 1-21 days in the future
        const eventDate = new Date(now);
        eventDate.setDate(eventDate.getDate() + 1 + Math.floor(Math.random() * 21));
        // Random hour between 9am and 9pm
        eventDate.setHours(9 + Math.floor(Math.random() * 12), Math.random() < 0.5 ? 0 : 30, 0, 0);

        const endDate = new Date(eventDate);
        endDate.setHours(endDate.getHours() + 2 + Math.floor(Math.random() * 4)); // 2-5 hours duration

        const price = getRandomPrice(template.price_range);

        // Slight coordinate jitter for map variety
        const latJitter = (Math.random() - 0.5) * 0.05;
        const lngJitter = (Math.random() - 0.5) * 0.05;

        generatedEvents.push({
          title: `${title} - ${city.name}`,
          description: `Join us for ${title.toLowerCase()} at ${venue}, ${city.name}. ${price === 0 ? 'Free entry!' : `Tickets from ₦${price.toLocaleString()}.`} Don't miss out on the vibes!`,
          location: `${venue}, ${city.name}`,
          latitude: city.lat + latJitter,
          longitude: city.lng + lngJitter,
          start_date: eventDate.toISOString(),
          end_date: endDate.toISOString(),
          ticket_price: price,
          category: template.category,
          creator_id: fallbackCreatorId,
          is_sponsored: Math.random() < 0.1, // 10% sponsored
          is_public: true,
          event_type: 'physical',
        });
      }
    }

    // Batch insert
    if (generatedEvents.length > 0) {
      const { error } = await supabase.from('events').insert(generatedEvents);
      if (error) throw error;
    }

    console.log(`✅ Generated ${generatedEvents.length} events across ${NIGERIAN_CITIES.length} cities`);

    return new Response(JSON.stringify({
      success: true,
      message: `Generated ${generatedEvents.length} events across ${NIGERIAN_CITIES.length} Nigerian cities`,
      cities: NIGERIAN_CITIES.map(c => c.name),
      count: generatedEvents.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Scrape error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
