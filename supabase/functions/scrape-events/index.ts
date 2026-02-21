import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Nigerian cities with coordinates
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

// Category mapping for scraped events
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Music': ['concert', 'music', 'afrobeats', 'amapiano', 'jazz', 'gospel', 'live band', 'dj', 'highlife'],
  'Party': ['party', 'rave', 'owambe', 'club', 'nightlife', 'brunch', 'pool party', 'glow'],
  'Tech': ['tech', 'startup', 'hackathon', 'developer', 'coding', 'ai', 'web3', 'blockchain', 'devfest'],
  'Sports': ['football', 'run', 'fitness', 'gym', 'yoga', 'marathon', 'cycling', 'volleyball'],
  'Arts': ['art', 'exhibition', 'gallery', 'photography', 'fashion', 'film', 'poetry', 'spoken word', 'theatre'],
  'Food': ['food', 'cooking', 'suya', 'brunch', 'wine', 'tasting', 'culinary', 'restaurant'],
  'Networking': ['networking', 'mixer', 'meetup', 'conference', 'summit', 'workshop', 'seminar', 'career'],
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'Networking'; // default
}

function getCityCoords(cityName: string): { lat: number; lng: number } | null {
  const city = NIGERIAN_CITIES.find(c => cityName.toLowerCase().includes(c.name.toLowerCase()));
  if (city) {
    // Add jitter for map variety
    return {
      lat: city.lat + (Math.random() - 0.5) * 0.05,
      lng: city.lng + (Math.random() - 0.5) * 0.05,
    };
  }
  return null;
}

// Unsplash cover photos by category for fallback
const CATEGORY_COVERS: Record<string, string[]> = {
  'Music': [
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&q=80',
  ],
  'Party': [
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
  ],
  'Tech': [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80',
  ],
  'Sports': [
    'https://images.unsplash.com/photo-1461896836934-bd45ba8aa120?w=800&q=80',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&q=80',
  ],
  'Arts': [
    'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&q=80',
    'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80',
    'https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=800&q=80',
  ],
  'Food': [
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
  ],
  'Networking': [
    'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&q=80',
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
  ],
};

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getCoverPhoto(category: string, scrapedImage?: string): string {
  if (scrapedImage && scrapedImage.startsWith('http')) return scrapedImage;
  const covers = CATEGORY_COVERS[category] || CATEGORY_COVERS['Networking'];
  return getRandomItem(covers);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse optional city filter from request body
    let targetCity: string | null = null;
    try {
      const body = await req.json();
      targetCity = body?.city || null;
    } catch { /* no body is fine */ }

    console.log(`🔍 Starting Firecrawl event scrape${targetCity ? ` for ${targetCity}` : ' for all Nigerian cities'}...`);

    // Get a valid creator_id
    const { data: profileData } = await supabase.from('profiles').select('user_id').limit(1).single();
    const fallbackCreatorId = profileData?.user_id;
    if (!fallbackCreatorId) {
      return new Response(JSON.stringify({ error: 'No users found to assign as creator' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine which cities to scrape
    const citiesToScrape = targetCity
      ? NIGERIAN_CITIES.filter(c => c.name.toLowerCase() === targetCity!.toLowerCase())
      : NIGERIAN_CITIES;

    if (citiesToScrape.length === 0 && targetCity) {
      // If the target city isn't in our list, use it as-is with no coords
      citiesToScrape.push({ name: targetCity, lat: 6.5244, lng: 3.3792, state: 'Unknown' });
    }

    const allScrapedEvents: any[] = [];

    // Scrape events from multiple sources per city using Firecrawl search
    for (const city of citiesToScrape) {
      try {
        console.log(`🏙️ Scraping events for ${city.name}...`);

        // Use Firecrawl search to find events
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `upcoming events in ${city.name} Nigeria 2026`,
            limit: 8,
            scrapeOptions: {
              formats: ['markdown'],
            },
          }),
        });

        if (!searchResponse.ok) {
          console.error(`❌ Firecrawl search failed for ${city.name}: ${searchResponse.status}`);
          continue;
        }

        const searchData = await searchResponse.json();
        const results = searchData.data || [];

        console.log(`📄 Got ${results.length} search results for ${city.name}`);

        for (const result of results) {
          try {
            const title = result.title || '';
            const description = result.description || result.markdown?.substring(0, 300) || '';
            const sourceUrl = result.url || '';

            // Skip non-event results
            if (!title || title.length < 5) continue;
            const skipKeywords = ['login', 'signup', 'privacy', 'terms', 'cookie'];
            if (skipKeywords.some(k => title.toLowerCase().includes(k))) continue;

            const category = detectCategory(`${title} ${description}`);
            const coords = getCityCoords(city.name);

            // Try to extract image from the scraped page metadata
            const scrapedImage = result.metadata?.ogImage || result.metadata?.image || null;

            // Generate a future date for this event (1-28 days out)
            const eventDate = new Date();
            eventDate.setDate(eventDate.getDate() + 1 + Math.floor(Math.random() * 28));
            eventDate.setHours(9 + Math.floor(Math.random() * 12), Math.random() < 0.5 ? 0 : 30, 0, 0);

            const endDate = new Date(eventDate);
            endDate.setHours(endDate.getHours() + 2 + Math.floor(Math.random() * 4));

            allScrapedEvents.push({
              title: title.substring(0, 200),
              description: description.substring(0, 500),
              location: `${city.name}, ${city.state}`,
              latitude: coords?.lat || city.lat,
              longitude: coords?.lng || city.lng,
              start_date: eventDate.toISOString(),
              end_date: endDate.toISOString(),
              ticket_price: Math.random() < 0.3 ? 0 : Math.round(Math.random() * 15000 / 500) * 500,
              category,
              creator_id: fallbackCreatorId,
              is_sponsored: false,
              is_public: true,
              event_type: 'physical',
              image_url: getCoverPhoto(category, scrapedImage),
            });
          } catch (e) {
            console.error(`⚠️ Error parsing result:`, e);
          }
        }
      } catch (cityError) {
        console.error(`❌ Failed to scrape ${city.name}:`, cityError);
      }
    }

    console.log(`📊 Total scraped events: ${allScrapedEvents.length}`);

    // Deduplicate by title similarity before inserting
    const seen = new Set<string>();
    const uniqueEvents = allScrapedEvents.filter(e => {
      const key = e.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Also check against existing events to avoid duplicates
    const { data: existingEvents } = await supabase
      .from('events')
      .select('title')
      .gt('start_date', new Date().toISOString());

    const existingTitles = new Set((existingEvents || []).map((e: any) => e.title.toLowerCase().substring(0, 50)));
    const newEvents = uniqueEvents.filter(e => !existingTitles.has(e.title.toLowerCase().substring(0, 50)));

    // Batch insert new events
    if (newEvents.length > 0) {
      const { error } = await supabase.from('events').insert(newEvents);
      if (error) throw error;
    }

    console.log(`✅ Inserted ${newEvents.length} new events (${uniqueEvents.length - newEvents.length} duplicates skipped)`);

    return new Response(JSON.stringify({
      success: true,
      message: `Scraped ${allScrapedEvents.length} events, inserted ${newEvents.length} new events`,
      cities_scraped: citiesToScrape.map(c => c.name),
      total_scraped: allScrapedEvents.length,
      new_inserted: newEvents.length,
      duplicates_skipped: uniqueEvents.length - newEvents.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Scrape error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
