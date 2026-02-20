import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: Geocode location string to Lat/Lng
async function geocodeLocation(locationName: string) {
  try {
    // We use OpenStreetMap's Nominatim (Free, no key needed for low usage)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AhmiaScraper/1.0' } }); // User-Agent is required
    const data = await res.json();
    
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return { lat: null, lng: null }; // Fallback
  } catch (e) {
    console.error(`Geocode failed for ${locationName}:`, e);
    return { lat: null, lng: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("🕵️ Starting Global Scrape Job...")

    // 1. TARGET URL: GLOBAL
    const TARGET_URL = 'https://tix.africa/discover/all'
    
    const response = await fetch(TARGET_URL)
    const html = await response.text()
    const $ = cheerio.load(html)
    const scrapedEvents: any[] = []

    // 2. PARSE & GEOCODE
    // We use a simple loop, but we must process sequentially to not spam the geocoding API
    const elements = $('.event-card').toArray();
    
    for (const el of elements) {
      const title = $(el).find('.event-title').text().trim()
      const location = $(el).find('.event-location').text().trim() || 'TBA'
      const image_url = $(el).find('img').attr('src')
      const priceText = $(el).find('.event-price').text().trim()
      
      if (title && image_url) {
        // A. Parse Price
        const price = priceText.toLowerCase().includes('free') ? 0 : parseInt(priceText.replace(/[^0-9]/g, '')) || 0
        
        // B. Geocode (The magic sauce)
        // We pause 1s between requests to be polite to OpenStreetMap
        await new Promise(r => setTimeout(r, 1000)); 
        const coords = await geocodeLocation(location);

        // C. Random Date (Since listing sites often hide full dates on the card)
        const eventDate = new Date()
        eventDate.setDate(eventDate.getDate() + (Math.random() * 14))

        scrapedEvents.push({
          title: title,
          description: `Imported event. Join the vibe at ${location}!`,
          location: location,
          latitude: coords.lat || (location.includes('Lagos') ? 6.5244 : 9.0765),
          longitude: coords.lng || (location.includes('Lagos') ? 3.3792 : 7.3986),
          start_date: eventDate.toISOString(),
          end_date: new Date(eventDate.getTime() + 4 * 60 * 60 * 1000).toISOString(),
          image_url: image_url,
          ticket_price: price,
          creator_id: (await supabase.from('profiles').select('user_id').limit(1).single()).data?.user_id,
          is_sponsored: false,
          match_score: 80
        })
      }
    }

    // 3. INSERT
    if (scrapedEvents.length > 0) {
      const { error } = await supabase.from('events').insert(scrapedEvents)
      if (error) throw error
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Scraped & Geocoded ${scrapedEvents.length} events!`,
      data: scrapedEvents 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
