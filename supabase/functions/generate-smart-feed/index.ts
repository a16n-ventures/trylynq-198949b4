import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LAUNCH_ZONES = {
  ZARIA: {
    name: "Zaria",
    coords: { lat: 11.1500, long: 7.6500 },
    threshold: 500,
  },
  ABUJA: {
    name: "Abuja",
    coords: { lat: 9.0765, long: 7.3986 },
    threshold: 1000,
  },
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const geoCache = new Map(); 

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_id, user_lat, user_long } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
          
    // ROUNDING: Round lat/long to 2 decimal places (~1.1km precision)
    // This drastically increases cache hits and prevents redundant API calls.
    const cacheKey = `${user_lat.toFixed(2)}_${user_long.toFixed(2)}`;
    
    let cityName: string | null = geoCache.has(cacheKey) ? geoCache.get(cacheKey) : null
  
      if (!cityName) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s limit
    
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${user_lat}&lon=${user_long}`, 
            { 
              headers: { 'User-Agent': 'Ahmia-App-Zaria' },
              signal: controller.signal 
            }
          );
    
          if (geoRes.ok) {
            const data = await geoRes.json();
            const addr = data.address;
            // Broaden the search for the name
            cityName = addr.city || 
                       addr.town || 
                       addr.village || 
                       addr.suburb || 
                       addr.neighbourhood || 
                       addr.state_district || 
                       addr.county || 
                       null; // High-confidence fallback if you're near the coords
            if (cityName) geoCache.set(cacheKey); // Save to local cache
          }
        } catch (e) {
          console.error("Geocoding timed out, using fallback");
        } 
      }
      
      cityName = cityName ?? "Your City"; 
      
      if (cityName === "Your City") {
        for (const [_, zone] of Object.entries(LAUNCH_ZONES)) {
            const dist = calculateDistance(user_lat, user_long, zone.coords.lat, zone.coords.long);
            if (dist <= 50) { // 30km radius as a generous fallback
              cityName = zone.name;
              break;
            }
          }
        }
      
      // 2. FUZZY MATCHING (Requirement 1 & 2)
      let activeZone = null;
      for (const [key, zone] of Object.entries(LAUNCH_ZONES)) {
        const dist = calculateDistance(user_lat, user_long, zone.coords.lat, zone.coords.long);
        
        // Check by distance OR if the geocoded city name matches our zone name
        if (dist <= 50 || cityName.toLowerCase().includes(zone.name.toLowerCase())) { 
          activeZone = zone;
          break;
        }
      }
      
      // 3. FINAL STATE LOGIC
      const isLaunchZone = !!activeZone;
      const searchName = activeZone?.name || cityName;
            
      const { count: pioneerCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .ilike('location', `%${searchName}%`);
  
      // Logic for UI branching
      const isUnlocked = isLaunchZone && pioneerCount >= (activeZone?.threshold ?? 0);
  
      return new Response(JSON.stringify({
        success: true,
        events: isUnlocked ? (await supabase.from('events').select('*').limit(10)).data : [],
        milestone: {
          current: pioneerCount || 0,
          target: activeZone?.threshold || 500,
          is_unlocked: isUnlocked,
          is_launch_zone: isLaunchZone,
          zone_name: searchName // The "Dynamic" name
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
  });
