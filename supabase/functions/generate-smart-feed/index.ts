import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. CACHING & GEOCODING
    const cacheKey = `${user_lat.toFixed(2)}_${user_long.toFixed(2)}`;
    let cityName: string | null = geoCache.has(cacheKey) ? geoCache.get(cacheKey) : null;

    if (!cityName) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${user_lat}&lon=${user_long}`, 
          { 
            headers: { 'User-Agent': 'Ahmia-App-Production' },
            signal: controller.signal 
          }
        );

        if (geoRes.ok) {
          const data = await geoRes.json();
          const addr = data.address;
          cityName = addr.city || addr.town || addr.village || addr.suburb || addr.state_district || null;
          if (cityName) geoCache.set(cacheKey, cityName);
        }
      } catch (e) {
        console.error("Geocoding failed, falling back to coordinate matching");
      }
    }

    // 2. DYNAMIC CITY MATCHING FROM DATABASE
    const { data: milestones } = await supabase.from('city_milestones').select('*');
    let activeZone = null;

    if (milestones) {
      for (const zone of milestones) {
        const dist = calculateDistance(user_lat, user_long, zone.center_lat, zone.center_long);
        const radius = zone.radius_km || 25;

        // Match by proximity OR by the geocoded city name
        if (dist <= radius || (cityName && cityName.toLowerCase().includes(zone.city_name.toLowerCase()))) {
          activeZone = zone;
          break;
        }
      }
    }

    // 3. FINAL LOGIC & PIONEER COUNT
    const isLaunchZone = !!activeZone;
    const finalCityName = activeZone?.city_name || cityName || "Unknown Location";
    
    // Query profiles for the pioneer count in this specific city
    const { count: pioneerCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .ilike('location', `%${finalCityName}%`);

    const isUnlocked = activeZone?.is_unlocked ?? (isLaunchZone ? pioneerCount >= (activeZone?.target_count || 500) : true);

    return new Response(JSON.stringify({
      success: true,
      events: isUnlocked ? (await supabase.from('events').select('*').limit(10)).data : [],
      milestone: {
        current: pioneerCount || 0,
        target: activeZone?.target_count || 500,
        is_unlocked: isUnlocked,
        is_launch_zone: isLaunchZone,
        zone_name: finalCityName
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
