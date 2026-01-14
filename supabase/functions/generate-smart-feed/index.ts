import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

// CORS Headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedRequest {
  user_id: string;
  user_lat?: number;
  user_long?: number;
  city?: string;
  location_name?: string;
}

serve(async (req) => {
  // Handle Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, user_lat, user_long, city, location_name } = await req.json() as FeedRequest;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Attempt AI gateway connection for premium users
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    // --- FETCH DATA ---
    const [profileRes, friendsRes, adsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`),
      supabase.from('advertisements').select('*').eq('is_active', true).limit(10)
    ]);

    const profile = profileRes.data || { is_premium: false, interests: [] };
    const rawAds = adsRes.data || [];
    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    let feedData: any[] = [];
    let eventsData: any[] = [];
    let communitiesData: any[] = [];

    // --- LOCATION-BASED AGGREGATION ---
    // Build location filter for events and communities
    let locationFilter = '';
    if (city) {
      locationFilter = city;
    } else if (location_name) {
      locationFilter = location_name;
    }

    // Fetch Events - prioritize by location and recency
    const eventsQuery = supabase
      .from('events')
      .select(`
        *,
        event_attendees(count)
      `)
      .gt('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(30);

    // Apply location filter if available
    if (locationFilter) {
      eventsQuery.ilike('location', `%${locationFilter}%`);
    }

    const { data: events } = await eventsQuery;

    // Fetch Communities
    const communitiesQuery = supabase
      .from('communities')
      .select(`
        *,
        community_members!inner(user_id, role)
      `)
      .order('member_count', { ascending: false })
      .limit(20);

    const { data: communities } = await communitiesQuery;

    // Fetch Posts with proper profile joins
    const { data: posts } = await supabase
      .from('social_posts')
      .select(`
        *,
        profiles!social_posts_user_id_fkey(display_name, avatar_url, user_id)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    // --- PROCESS POSTS ---
    if (posts) {
      feedData = posts.map((post: any) => {
        let score = 0;
        
        // Boost friends' posts
        if (friendIds.includes(post.user_id)) score += 30;
        
        // Recency boost (decay over time)
        const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
        score -= Math.min(hoursOld * 0.5, 20); // Max 20 point penalty
        
        // Engagement boost
        score += (post.likes_count || 0) * 0.5;
        score += (post.comments_count || 0) * 1;
        
        return { 
          ...post, 
          type: 'post', 
          sortScore: score,
          profiles: post.profiles || { display_name: 'Unknown User', avatar_url: null, user_id: post.user_id }
        };
      }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40);
    }

    // --- PROCESS EVENTS ---
    if (events) {
      // Check user's attendance status
      const { data: userAttendance } = await supabase
        .from('event_attendees')
        .select('event_id')
        .eq('user_id', user_id);

      const attendingEventIds = new Set(userAttendance?.map(a => a.event_id) || []);

      eventsData = events.map((event: any) => {
        let matchScore = 50; // Base score
        
        // Location proximity boost
        if (user_lat && user_long && event.latitude && event.longitude) {
          const distance = calculateDistance(user_lat, user_long, event.latitude, event.longitude);
          if (distance < 10) matchScore += 30;
          else if (distance < 50) matchScore += 15;
          else if (distance < 100) matchScore += 5;
        }
        
        // Interest matching
        if (profile.interests && event.category) {
          const userInterests = profile.interests.map((i: string) => i.toLowerCase());
          if (userInterests.includes(event.category.toLowerCase())) {
            matchScore += 25;
          }
        }
        
        // Popularity boost
        const attendeeCount = event.event_attendees?.[0]?.count || 0;
        matchScore += Math.min(attendeeCount * 0.5, 15);
        
        // Boosted events get priority
        if (event.is_boosted) matchScore += 20;
        
        return {
          ...event,
          type: 'event',
          match_score: Math.min(matchScore, 100),
          attendee_count: attendeeCount,
          is_attending: attendingEventIds.has(event.id),
          is_sponsored: event.is_boosted
        };
      }).sort((a: any, b: any) => b.match_score - a.match_score);
    }

    // --- PROCESS COMMUNITIES ---
    if (communities) {
      // Check user's membership
      const { data: userMemberships } = await supabase
        .from('community_members')
        .select('community_id, role')
        .eq('user_id', user_id);

      const membershipMap = new Map(userMemberships?.map(m => [m.community_id, m.role]) || []);

      communitiesData = communities.map((community: any) => {
        let matchScore = 40;
        
        // Member count popularity
        matchScore += Math.min((community.member_count || 0) * 0.3, 20);
        
        // User is already a member - show first
        if (membershipMap.has(community.id)) {
          matchScore += 30;
        }
        
        return {
          ...community,
          type: 'community',
          match_score: Math.min(matchScore, 100),
          is_member: membershipMap.has(community.id),
          my_role: membershipMap.get(community.id) || null
        };
      }).sort((a: any, b: any) => b.match_score - a.match_score);
    }

    // --- ENHANCED AD SYSTEM ---
    // Process ads with different placements and targeting
    const processedAds = rawAds.map((ad: any) => ({
      id: `ad-${ad.id}`,
      type: 'ad',
      post_type: 'ad',
      title: ad.title,
      content: ad.description,
      image_url: ad.image_url,
      link_url: ad.link_url,
      placement: ad.placement,
      profiles: { 
        display_name: ad.title || 'Sponsored', 
        avatar_url: ad.image_url,
        user_id: 'ad'
      },
      created_at: new Date().toISOString(),
      is_sponsored: true
    }));

    // Intersperse ads into feed (every 5-7 posts)
    const finalFeed: any[] = [];
    let adIndex = 0;
    const adInterval = 6;

    feedData.forEach((item, index) => {
      // Insert ad at intervals
      if (index > 0 && index % adInterval === 0 && processedAds[adIndex]) {
        finalFeed.push(processedAds[adIndex]);
        adIndex = (adIndex + 1) % processedAds.length;
      }
      finalFeed.push(item);
    });

    // --- AI AGGREGATION FOR PREMIUM USERS ---
    let aiInsights = null;
    if (profile.is_premium && lovableApiKey && locationFilter) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [{
              role: 'user',
              content: `Based on these events and communities in ${locationFilter}, provide a brief 2-sentence summary of what's happening:
              
Events: ${eventsData.slice(0, 5).map(e => e.title).join(', ')}
Communities: ${communitiesData.slice(0, 5).map(c => c.name).join(', ')}

Be concise and highlight the most interesting opportunities.`
            }],
            max_tokens: 100
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiInsights = aiData.choices?.[0]?.message?.content || null;
        }
      } catch (aiError) {
        console.error('AI aggregation failed:', aiError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      posts: finalFeed, 
      events: eventsData,
      communities: communitiesData,
      ads: processedAds,
      ai_insights: aiInsights,
      is_premium: profile.is_premium,
      location_context: locationFilter || null
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('Feed generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Haversine distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
