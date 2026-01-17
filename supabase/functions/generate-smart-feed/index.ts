import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, user_lat, user_long, city, location_name } = await req.json() as FeedRequest;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. FETCH BASIC USER DATA
    const [profileRes, friendsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`)
    ]);

    const profile = profileRes.data || { is_premium: false, interests: [] };
    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    // 2. FETCH PREMIUM SOCIAL GRAPH DATA (Only if friends exist)
    // We need to know what friends are doing to power the "Clyx" engine
    let friendInterests: string[] = [];
    let friendAttendance = new Set<string>(); // Set of Event IDs friends are going to
    let friendLikedPosts = new Set<string>(); // Set of Post IDs friends liked

    if (friendIds.length > 0) {
      const [fProfiles, fAttendance, fLikes] = await Promise.all([
        // Get Friends' Interests
        supabase.from('profiles').select('interests').in('user_id', friendIds),
        // Get Events Friends are attending
        supabase.from('event_attendees').select('event_id').in('user_id', friendIds),
        // Get Posts Friends liked (Mutual Discovery)
        supabase.from('post_likes').select('post_id').in('user_id', friendIds).limit(100)
      ]);

      // Flatten interests
      fProfiles.data?.forEach((p: any) => {
        if (p.interests) friendInterests.push(...p.interests);
      });
      
      // Map Attendance & Likes
      fAttendance.data?.forEach((a: any) => friendAttendance.add(a.event_id));
      fLikes.data?.forEach((l: any) => friendLikedPosts.add(l.post_id));
    }

    // 3. FETCH USER ADS (Targeting Regular Users)
    const { data: rawAds } = await supabase
      .from('user_ads')
      .select('*')
      .eq('status', 'active') 
      .limit(10);

    let feedData: any[] = [];
    let eventsData: any[] = [];
    let communitiesData: any[] = [];

    // --- LOCATION CONTEXT ---
    let locationFilter = '';
    if (city) locationFilter = city;
    else if (location_name) locationFilter = location_name;

    // 4. FETCH CONTENT
    // Events: Premium users get a wider time/location window implicitly
    const eventsQuery = supabase
      .from('events')
      .select(`*, event_attendees(count)`)
      .gt('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(50); // Fetch more to allow for filtering/ranking

    if (locationFilter && !profile.is_premium) {
      // Regular users are locked to their city. 
      // Premium users see everything, sorted by relevance later (Wanderlust).
      eventsQuery.ilike('location', `%${locationFilter}%`);
    }

    const { data: events } = await eventsQuery;

    const communitiesQuery = supabase
      .from('communities')
      .select(`*, community_members!inner(user_id, role)`)
      .order('member_count', { ascending: false })
      .limit(30);

    const { data: communities } = await communitiesQuery;

    const { data: posts, error: postsError } = await supabase
      .from('social_posts')
      .select(`*, profiles (display_name, avatar_url, user_id)`)
      .order('created_at', { ascending: false })
      .limit(70); // Fetch deeper pool for algorithmic sorting
      
    if (postsError) console.error("Error fetching posts:", postsError);

    // --- ALGORITHM: POSTS ---
    if (posts) {
      feedData = posts.map((post: any) => {
        let score = 0;
        
        // BASE SCORE
        const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
        score -= Math.min(hoursOld * 0.5, 20); // Recency Decay
        score += (post.likes_count || 0) * 0.5;
        score += (post.comments_count || 0) * 1;

        // DIRECT FRIEND BOOST (Everyone gets this)
        if (friendIds.includes(post.user_id)) score += 30;

        // --- PREMIUM INTELLIGENCE LAYER ---
        if (profile.is_premium) {
           // 1. MUTUAL DISCOVERY: If a friend liked this stranger's post, show it.
           if (friendLikedPosts.has(post.id) && !friendIds.includes(post.user_id)) {
             score += 25; // "Your friend X liked this"
           }
           
           // 2. RETENTION BOOST: Premium users see high-quality content longer
           // We reverse the age penalty slightly for high-performing posts
           if (post.likes_count > 20) score += 10;
        }

        return { 
          ...post, 
          type: 'post', 
          sortScore: score,
          profiles: post.profiles || { display_name: 'Unknown User', avatar_url: null, user_id: post.user_id }
        };
      }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40);
    }

    // --- ALGORITHM: EVENTS (The "Clyx" Core) ---
    if (events) {
      const { data: userAttendance } = await supabase.from('event_attendees').select('event_id').eq('user_id', user_id);
      const attendingEventIds = new Set(userAttendance?.map(a => a.event_id) || []);

      eventsData = events.map((event: any) => {
        let matchScore = 50; 

        // 1. LOCAL RELEVANCE (NIGERIA LOGIC)
        const nigerianKeywords = ['owambe', 'party', 'tech', 'lagos', 'abuja', 'vibes', 'cruise', 'wedding'];
        if (nigerianKeywords.some(k => event.title.toLowerCase().includes(k))) {
            matchScore += 15; 
        }

        // 2. DISTANCE LOGIC (The "Wanderlust" Differentiator)
        if (user_lat && user_long && event.latitude && event.longitude) {
          const distance = calculateDistance(user_lat, user_long, event.latitude, event.longitude);
          
          if (profile.is_premium) {
             // PREMIUM: Willing to travel for vibes
             if (distance < 10) matchScore += 40;        // Hyper-local
             else if (distance < 50) matchScore += 30;   // City-wide
             else if (distance < 150) matchScore += 15;  // Inter-state (Wanderlust)
             // No penalty for distance if score is high enough
          } else {
             // REGULAR: Stuck in traffic, needs close events
             if (distance < 5) matchScore += 40;
             else if (distance < 15) matchScore += 20;
             else matchScore -= 20; // Penalize far events heavily
          }
        }

        // 3. SOCIAL PROOF (The "Inner Circle")
        const attendeeCount = event.event_attendees?.[0]?.count || 0;
        matchScore += Math.min(attendeeCount * 1.5, 40); // General crowd

        if (profile.is_premium) {
           // FOMO: If friends are going, it's a MUST see
           if (friendAttendance.has(event.id)) {
             matchScore += 100; // Nuclear Boost: "Your friends are here"
           }
           
           // SHARED INTERESTS: If friends like this category, you might too
           if (friendInterests.includes(event.category)) {
             matchScore += 10;
           }
        }
        
        // 4. PERSONAL INTERESTS
        if (profile.interests && event.category) {
          const userInterests = profile.interests.map((i: string) => i.toLowerCase());
          if (userInterests.includes(event.category.toLowerCase())) matchScore += 25;
        }

        if (event.is_boosted) matchScore += 20;
        
        return {
          ...event,
          type: 'event',
          match_score: Math.min(matchScore, 100), // Cap at 100 for UI consistency
          attendee_count: attendeeCount,
          is_attending: attendingEventIds.has(event.id),
          is_sponsored: event.is_boosted
        };
      }).sort((a: any, b: any) => b.match_score - a.match_score);
    }

    // --- ALGORITHM: COMMUNITIES ---
    if (communities) {
      const { data: userMemberships } = await supabase.from('community_members').select('community_id, role').eq('user_id', user_id);
      const membershipMap = new Map(userMemberships?.map(m => [m.community_id, m.role]) || []);

      communitiesData = communities.map((community: any) => {
        let matchScore = 40;
        matchScore += Math.min((community.member_count || 0) * 0.3, 20);
        
        if (membershipMap.has(community.id)) {
          matchScore += 30;
        }
        
        // Premium Boost: Exclusive Communities
        if (profile.is_premium && (community.name.includes('Exclusive') || community.name.includes('Premium'))) {
            matchScore += 20;
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

    // --- ADS INJECTION (REGULAR ONLY) ---
    const processedAds = (rawAds || []).map((ad: any) => ({
      id: `sponsored-${ad.id}`,
      type: 'ad',
      post_type: 'ad',
      content: ad.content || ad.description || 'Sponsored Content', 
      image_url: ad.image_url,
      location: 'Sponsored',
      likes_count: 0,
      comments_count: 0,
      created_at: new Date().toISOString(),
      profiles: { 
        display_name: ad.title || 'Sponsored', 
        avatar_url: null,
        user_id: 'sponsor'
      },
      is_sponsored: true
    }));

    const finalFeed: any[] = [];
    let adIndex = 0;
    const adInterval = 6; 

    feedData.forEach((item, index) => {
      // PREMIUM GATE: No ads for premium users
      if (!profile.is_premium && index > 0 && index % adInterval === 0 && processedAds[adIndex]) {
        finalFeed.push(processedAds[adIndex]);
        adIndex = (adIndex + 1) % processedAds.length;
      }
      finalFeed.push(item);
    });

    // --- AI INSIGHTS (PREMIUM ONLY) ---
    let aiInsights = null;
    const openAiKey = Deno.env.get('OPENAI_API_KEY'); 

    if (profile.is_premium && openAiKey && locationFilter) {
      try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'system',
              content: `You are a hype-man for ${locationFilter}, Nigeria. 
                Look at these events: ${eventsData.slice(0, 5).map(e => e.title).join(', ')}.
                Give a 2-sentence "Vibe Check". Tell me where the action is. 
                Keep it slang-heavy and fun (use words like 'Owambe', 'Detty December'). Don't be formal, make it sound like a text from a friend.`
            }],
            max_tokens: 150
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiInsights = aiData.choices?.[0]?.message?.content || null;
        }
      } catch (aiError) {
        console.error('OpenAI aggregation failed:', aiError);
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
