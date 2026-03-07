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

// --- DATE PARSING: Extract real dates from scraped text ---
function parseEventDate(text: string): { start: Date; end: Date } | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Common date patterns
  const patterns = [
    // "January 15, 2026" or "Jan 15 2026"
    /(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i,
    // "15 January 2026" or "15th Jan 2026"
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s*\d{4})/i,
    // "2026-03-15" ISO format
    /(\d{4}-\d{2}-\d{2})/,
    // "15/03/2026" or "03/15/2026"
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    // "January 15" (no year - assume current/next year)
    /(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let dateStr = match[1].replace(/(st|nd|rd|th)/gi, '');
      // Add current year if missing
      if (!/\d{4}/.test(dateStr)) {
        dateStr += ` ${currentYear}`;
      }
      try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && parsed > now) {
          const end = new Date(parsed);
          end.setHours(end.getHours() + 3);
          return { start: parsed, end };
        }
      } catch { /* continue to next pattern */ }
    }
  }

  // Also try to extract time: "7pm", "19:00", "7:00 PM"
  return null;
}

// Extract time and apply to date
function applyTimeToDate(date: Date, text: string): Date {
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,
    /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2}):(\d{2})/,
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      const result = new Date(date);
      result.setHours(hours, minutes, 0, 0);
      return result;
    }
  }
  
  // Default to 6pm for events
  const result = new Date(date);
  result.setHours(18, 0, 0, 0);
  return result;
}

// --- PRICE PARSING: Extract real prices from scraped text ---
function parseTicketPrice(text: string): number {
  const lower = text.toLowerCase();
  
  // Check for free indicators
  if (/\bfree\b|\bno\s+charge\b|\bfree\s+entry\b|\bfree\s+admission\b|\bcomplimentary\b/i.test(lower)) {
    return 0;
  }
  
  // Nigerian Naira patterns: "₦5,000", "NGN 5000", "N5,000", "5000 naira", "From ₦3,000"
  const nairaPatterns = [
    /[₦N][\s]?([\d,]+(?:\.\d{2})?)/,
    /NGN[\s]?([\d,]+(?:\.\d{2})?)/i,
    /([\d,]+(?:\.\d{2})?)\s*naira/i,
    /from\s*[₦N][\s]?([\d,]+)/i,
    /starting\s*(?:at|from)\s*[₦N][\s]?([\d,]+)/i,
  ];
  
  for (const pattern of nairaPatterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 0 && price < 1000000) return price;
    }
  }
  
  // Dollar patterns: "$50", "USD 50"
  const dollarPatterns = [
    /\$[\s]?([\d,]+(?:\.\d{2})?)/,
    /USD[\s]?([\d,]+(?:\.\d{2})?)/i,
  ];
  
  for (const pattern of dollarPatterns) {
    const match = text.match(pattern);
    if (match) {
      const usdPrice = parseFloat(match[1].replace(/,/g, ''));
      if (usdPrice > 0 && usdPrice < 10000) return Math.round(usdPrice * 1500); // Approximate NGN conversion
    }
  }
  
  // Generic price: just a number near "price", "ticket", "cost"
  const contextPrice = text.match(/(?:price|ticket|cost|fee|gate)[:\s]*[₦N$]?\s*([\d,]+)/i);
  if (contextPrice) {
    const price = parseFloat(contextPrice[1].replace(/,/g, ''));
    if (price > 100 && price < 1000000) return price;
  }
  
  return 0; // Default to free if no price found
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

    let targetCity: string | null = null;
    try {
      const body = await req.json();
      targetCity = body?.city || null;
    } catch { /* no body is fine */ }

    console.log(`🔍 Starting event scrape${targetCity ? ` for ${targetCity}` : ' for all cities'}...`);

    const { data: profileData } = await supabase.from('profiles').select('user_id').limit(1).single();
    const fallbackCreatorId = profileData?.user_id;
    if (!fallbackCreatorId) {
      return new Response(JSON.stringify({ error: 'No users found to assign as creator' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const citiesToScrape = targetCity
      ? NIGERIAN_CITIES.filter(c => c.name.toLowerCase() === targetCity!.toLowerCase())
      : NIGERIAN_CITIES;

    if (citiesToScrape.length === 0 && targetCity) {
      citiesToScrape.push({ name: targetCity, lat: 6.5244, lng: 3.3792, state: 'Unknown' });
    }

    const allScrapedEvents: any[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < citiesToScrape.length; i += BATCH_SIZE) {
      const batch = citiesToScrape.slice(i, i + BATCH_SIZE);
      console.log(`🏙️ Scraping batch: ${batch.map(c => c.name).join(', ')}...`);

      const batchResults = await Promise.allSettled(
        batch.map(async (city) => {
          // Use more targeted queries for better results
          const queries = [
            `events happening in ${city.name} Nigeria this month site:eventbrite.com OR site:tix.africa OR site:naijaloaded.com`,
            `upcoming events ${city.name} Nigeria 2026`
          ];
          
          const cityEvents: any[] = [];
          
          for (const query of queries) {
            const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query,
                limit: 5,
                scrapeOptions: { formats: ['markdown'] },
              }),
            });

            if (!searchResponse.ok) {
              console.error(`❌ Firecrawl failed for ${city.name}: ${searchResponse.status}`);
              continue;
            }

            const searchData = await searchResponse.json();
            const results = searchData.data || [];
            console.log(`📄 Got ${results.length} results for ${city.name}`);

            for (const result of results) {
              try {
                const title = result.title || '';
                const description = result.description || '';
                const markdown = result.markdown || '';
                const fullText = `${title} ${description} ${markdown}`;
                
                if (!title || title.length < 5) continue;
                const skipKeywords = ['login', 'signup', 'privacy', 'terms', 'cookie', 'subscribe'];
                if (skipKeywords.some(k => title.toLowerCase().includes(k))) continue;

                const category = detectCategory(fullText);
                const coords = getCityCoords(city.name);
                const scrapedImage = result.metadata?.ogImage || result.metadata?.image || null;

                // Parse REAL date from scraped content
                const parsedDates = parseEventDate(fullText);
                let startDate: Date;
                let endDate: Date;
                
                if (parsedDates) {
                  startDate = applyTimeToDate(parsedDates.start, fullText);
                  endDate = new Date(startDate);
                  endDate.setHours(endDate.getHours() + 3);
                  console.log(`📅 Parsed real date for "${title.substring(0, 40)}": ${startDate.toISOString()}`);
                } else {
                  // Fallback: schedule within next 30 days, but log it
                  console.log(`⚠️ No date found for "${title.substring(0, 40)}", using fallback`);
                  startDate = new Date();
                  startDate.setDate(startDate.getDate() + 3 + Math.floor(Math.random() * 25));
                  startDate.setHours(18, 0, 0, 0);
                  endDate = new Date(startDate);
                  endDate.setHours(21, 0, 0, 0);
                }

                // Parse REAL ticket price from scraped content
                const ticketPrice = parseTicketPrice(fullText);
                if (ticketPrice > 0) {
                  console.log(`💰 Parsed price for "${title.substring(0, 40)}": ₦${ticketPrice}`);
                }

                cityEvents.push({
                  title: title.substring(0, 200),
                  description: description.substring(0, 500),
                  location: `${city.name}, ${city.state}`,
                  latitude: coords?.lat || city.lat,
                  longitude: coords?.lng || city.lng,
                  start_date: startDate.toISOString(),
                  end_date: endDate.toISOString(),
                  ticket_price: ticketPrice,
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
            
            // If first query got results, skip second
            if (cityEvents.length >= 3) break;
          }
          
          return cityEvents;
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allScrapedEvents.push(...result.value);
        }
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
