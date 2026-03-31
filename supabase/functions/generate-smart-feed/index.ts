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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_id, user_lat, user_long } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
          
      // 1. REVERSE GEOCODE (Always do this first for the UI label)
      let cityName = "Unknown Location";
      if (user_lat && user_long) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${user_lat}&lon=${user_long}`, 
            { 
              headers: { 
                'User-Agent': 'Ahmia-Zaria-Launch-V1', // Use a unique string
                'Accept-Language': 'en' 
              } 
            }
          );
          
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            // OSM often puts the city in 'city', 'town', or 'county' for Nigerian addresses
            cityName = geoData.address.city || geoData.address.town || geoData.address.county || "Zaria";
          }
        } catch (e) {
          console.error("Geocoding failed, falling back to coordinate check");
        }
      }
      
      // 2. FUZZY MATCHING (Requirement 1 & 2)
      let activeZone = null;
      for (const [key, zone] of Object.entries(LAUNCH_ZONES)) {
        const dist = calculateDistance(user_lat, user_long, zone.coords.lat, zone.coords.long);
        
        // Check by distance OR if the geocoded city name matches our zone name
        if (dist <= 25 || cityName.toLowerCase().includes(zone.name.toLowerCase())) { 
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
