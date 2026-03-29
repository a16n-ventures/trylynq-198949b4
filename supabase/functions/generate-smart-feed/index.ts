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
    schools: ["ABU Samaru", "ABU Kongo", "Federal College of Education"]
  },
  ABUJA: {
    name: "Abuja",
    coords: { lat: 9.0765, long: 7.3986 },
    threshold: 1000,
    schools: ["UniAbuja Main", "UniAbuja Gwagwalada", "Baze University", "Nile University"]
  },
};

  /*
  KANO: {
    name: "Kano",
    coords: { lat: 11.9912, long: 8.5167 },
    threshold: 750,
    schools: ["Bayero University (BUK)", "Kano State University (KUST)", "Skyline University"]
  },
  BENIN: {
    name: "Benin City",
    coords: { lat: 6.3350, long: 5.6037 },
    threshold: 600,
    schools: ["UNIBEN Ugbowo", "UNIBEN Ekenwan", "Benson Idahosa University"]
  }
  */

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_id, user_lat, user_long, city } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1. DYNAMIC ZONE DETECTION
    let activeZone = null;
    let minDistance = Infinity;
    
    if (user_lat && user_long) {
      for (const zone of Object.values(LAUNCH_ZONES)) {
        const dist = calculateDistance(user_lat, user_long, zone.coords.lat, zone.coords.long);
        if (dist < 25 && dist < minDistance) {
          minDistance = dist;
          activeZone = zone;
        }
      }
    }

    // 2. MANUAL OVERRIDE (Must happen BEFORE cityToSearch)
    if (!activeZone && city) {
      const matchedZone = Object.values(LAUNCH_ZONES).find(z => 
        city.toLowerCase().includes(z.name.toLowerCase())
      );
      if (matchedZone) activeZone = matchedZone;
    }
    
    // 3. NOW DEFINE THE SEARCH TERM
    const cityToSearch = activeZone?.name || city || 'Global'; 
    
    // 4. PERFORM PIONEER COUNT
    const { count: pioneerCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_pioneer', true)
      .or(`address.ilike.%${cityToSearch}%,bio.ilike.%${cityToSearch}%`);

    const targetThreshold = activeZone?.threshold || 500;
    // If activeZone is null, it means the city is "Global" (Unlocked)
    // If activeZone is found, we lock if the count is below threshold
    const isCityLocked = activeZone ? (pioneerCount || 0) < targetThreshold : false;

    // 3. FETCH CONTENT
    const [profileRes, eventsRes, communitiesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('events').select(`*, event_attendees(count)`).gt('start_date', new Date().toISOString()).eq('is_public', true),
      supabase.from('communities').select(`*, community_members(count)`).limit(50)
    ]);

    const profile = profileRes.data || { interests: [] };

    // 4. ALGORITHM: CAMPUS BOOST & LOCK LOGIC
    const eventsData = (eventsRes.data || []).map((event: any) => {
      let matchScore = 50;
      
      // If Locked, hide non-official events
      if (isCityLocked && !event.is_official) return null;

      // School/Campus Boost (+40)
      if (activeZone?.schools.some(school => event.location?.includes(school) || event.description?.includes(school))) {
        matchScore += 40;
      }

      return {
        ...event,
        is_locked: isCityLocked,
        match_score: isCityLocked ? 100 : Math.min(matchScore, 100)
      };
    }).filter(Boolean);

    // 5. COMMUNITY FILTERING (Zaria-only if in Zaria)
    const communitiesData = (communitiesRes.data || []).filter(c => {
      if (!activeZone) return true;
      return c.name.toLowerCase().includes(activeZone.name.toLowerCase());
    });

    return new Response(JSON.stringify({ 
      success: true, 
      events: eventsData, 
      communities: communitiesData,
      location_context: activeZone?.name || city || "Global",
      milestone: {
        current: pioneerCount || 0,
        target: activeZone?.threshold || 0,
        is_unlocked: !isCityLocked,
        zone_name: activeZone?.name || "Global"
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}