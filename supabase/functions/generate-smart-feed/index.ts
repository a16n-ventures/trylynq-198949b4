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

    // 1. FETCH VIEWER CONTEXT (CRASH PROOFED)
    // FIX A: Use maybeSingle() instead of single() to prevent 500 Error Crash
    const [profileRes, friendsRes, viewerFeaturesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).maybeSingle(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`),
      supabase.from('premium_features')
        .select('feature_type')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
    ]);

    const profile = profileRes.data || { is_premium: false, interests: [] };
    // Handle JSON interests (Supabase returns them as array automatically)
    const viewerInterests = new Set((profile.interests || []).map((i: string) => i.toLowerCase()));
    
    // Viewer Features
    const viewerFeatures = new Set(viewerFeaturesRes.data?.map((f: any) => f.feature_type) || []);
    const hasFullPackage = viewerFeatures.has('full_package');
    const isViewerPremium = profile.is_premium || hasFullPackage || viewerFeatures.size > 0;

    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    // 2. FETCH CONTENT POOL
    const [eventsRes, communitiesRes, postsRes] = await Promise.all([
      supabase.from('events')
        .select(`*, event_attendees(count)`)
        .gt('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(50),

      supabase.from('communities')
        .select(`*, community_members!inner(user_id, role)`)
        .order('member_count', { ascending: false })
        .limit(30),

      // FIX B: We MUST fetch 'interests' in the join to make the algorithm work
      supabase.from('social_posts')
        .select(`*, profiles (display_name, avatar_url, user_id, interests)`)
        .order('created_at', { ascending: false })
        .limit(70)
    ]);

    const events = eventsRes.data || [];
    const communities = communitiesRes.data || [];
    const posts = postsRes.data || [];

    // 3. FETCH CREATOR "BOOST" STATUS
    const creatorIds = new Set([
      ...events.map((e: any) => e.user_id),
      ...posts.map((p: any) => p.user_id)
    ].filter(Boolean));

    let boostedCreators = new Set<string>(); // profile_boost
    let boostedEventCreators = new Set<string>(); // event_boost

    if (creatorIds.size > 0) {
      const { data: creatorFeatures } = await supabase
        .from('premium_features')
        .select('user_id, feature_type')
        .in('user_id', Array.from(creatorIds))
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      creatorFeatures?.forEach((f: any) => {
        if (f.feature_type === 'profile_boost' || f.feature_type === 'full_package') {
          boostedCreators.add(f.user_id);
        }
        if (f.feature_type === 'event_boost' || f.feature_type === 'full_package') {
          boostedEventCreators.add(f.user_id);
        }
      });
    }

    // 4. SOCIAL GRAPH (Mutual Discovery)
    let friendLikedPosts = new Set<string>();
    if (friendIds.length > 0) {
      const { data: fLikes } = await supabase.from('post_likes').select('post_id').in('user_id', friendIds).limit(100);
      fLikes?.forEach((l: any) => friendLikedPosts.add(l.post_id));
    }

    // --- INTELLIGENT PROCESSING ---

    // A. POSTS ALGORITHM (Context-Aware Boost)
    const feedData = posts.map((post: any) => {
      let score = 0;
      
      const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
      score -= Math.min(hoursOld * 0.5, 20); 
      score += (post.likes_count || 0) * 0.5;
      
      if (friendIds.includes(post.user_id)) score += 50;

      // >>> INTELLIGENT PROFILE BOOST <<<
      const authorHasBoost = boostedCreators.has(post.user_id);
      
      if (authorHasBoost) {
        const isLocal = post.location && city && post.location.includes(city);
        
        // Retrieve JSON interests safely
        const authorInterests = post.profiles?.interests || [];
        
        // Check intersection of Viewer Interests vs Author Interests
        const hasSharedInterest = Array.isArray(authorInterests) && 
          authorInterests.some((i: string) => viewerInterests.has(i.toLowerCase()));
        
        if (hasSharedInterest) {
           score += 60; // "Sniper" Match (High Relevance)
        } else if (isLocal) {
           score += 40; // Location Match
        } else {
           score += 10; // Generic Boost (Low Relevance)
        }
        
        if (score < 10) score = 10; 
      }

      if (isViewerPremium) {
         if (friendLikedPosts.has(post.id) && !friendIds.includes(post.user_id)) {
           score += 25; 
         }
      }

      return { 
        ...post, 
        type: 'post', 
        sortScore: score,
        profiles: post.profiles || { display_name: 'Unknown User', avatar_url: null, user_id: post.user_id }
      };
    }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40);

    // B. EVENTS ALGORITHM (20x Relevance Multiplier)
    const { data: userAttendance } = await supabase.from('event_attendees').select('event_id').eq('user_id', user_id);
    const attendingEventIds = new Set(userAttendance?.map(a => a.event_id) || []);

    const eventsData = events.map((event: any) => {
      let matchScore = 50; 

      if (user_lat && user_long && event.latitude && event.longitude) {
        const distance = calculateDistance(user_lat, user_long, event.latitude, event.longitude);
        const maxDist = isViewerPremium ? 500 : 20;
        
        if (distance < 5) matchScore += 40;
        else if (distance < maxDist) matchScore += 20;
        else matchScore -= 30;
      }

      let interestMatch = false;
      if (profile.interests && event.category) {
        const userInterests = profile.interests.map((i: string) => i.toLowerCase());
        if (userInterests.includes(event.category.toLowerCase())) {
          matchScore += 25;
          interestMatch = true;
        }
      }

      // >>> INTELLIGENT EVENT BOOST <<<
      const creatorHasBoost = boostedEventCreators.has(event.user_id);
      
      if (creatorHasBoost) {
        if (interestMatch) {
           matchScore = (matchScore + 50) * 20; // 20x Multiplier for RELEVANT events
        } else {
           matchScore += 50; // Standard boost for irrelevant ones
        }
      }

      // FIX C: Safety check for null title to prevent crash
      const nigerianKeywords = ['owambe', 'party', 'tech', 'lagos', 'abuja', 'vibes', 'cruise', 'wedding'];
      if (event.title && nigerianKeywords.some(k => event.title.toLowerCase().includes(k))) {
          matchScore += 15; 
      }

      return {
        ...event,
        type: 'event',
        match_score: Math.min(matchScore, 100), 
        raw_score: matchScore, 
        attendee_count: event.event_attendees?.[0]?.count || 0,
        is_attending: attendingEventIds.has(event.id),
        is_sponsored: event.is_boosted || (creatorHasBoost && interestMatch)
      };
    }).sort((a: any, b: any) => b.raw_score - a.raw_score);

    // C. COMMUNITIES
    const { data: userMemberships } = await supabase.from('community_members').select('community_id, role').eq('user_id', user_id);
    const membershipMap = new Map(userMemberships?.map(m => [m.community_id, m.role]) || []);

    const communitiesData = communities.map((community: any) => {
      let matchScore = 40;
      if (membershipMap.has(community.id)) matchScore += 30;
      if (isViewerPremium && (community.name.includes('Exclusive') || community.name.includes('Premium'))) matchScore += 20;
      
      return {
        ...community,
        type: 'community',
        match_score: Math.min(matchScore, 100),
        is_member: membershipMap.has(community.id),
        my_role: membershipMap.get(community.id) || null
      };
    }).sort((a: any, b: any) => b.match_score - a.match_score);

    // 5. ADS
    let processedAds: any[] = [];
    if (!hasFullPackage && !isViewerPremium) {
       const { data: rawAds } = await supabase.from('user_ads').select('*').eq('status', 'active').limit(10);
       processedAds = (rawAds || []).map((ad: any) => ({
        id: `sponsored-${ad.id}`,
        type: 'ad',
        post_type: 'ad',
        content: ad.content || 'Sponsored Content', 
        image_url: ad.image_url,
        location: 'Sponsored',
        likes_count: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        profiles: { display_name: ad.title || 'Sponsored', avatar_url: null, user_id: 'sponsor' },
        is_sponsored: true
      }));
    }

    const finalFeed: any[] = [];
    let adIndex = 0;
    feedData.forEach((item, index) => {
      if (processedAds.length > 0 && index > 0 && index % 6 === 0 && processedAds[adIndex]) {
        finalFeed.push(processedAds[adIndex]);
        adIndex = (adIndex + 1) % processedAds.length;
      }
      finalFeed.push(item);
    });

    // 6. AI INSIGHTS
    let aiInsights = null;
    const openAiKey = Deno.env.get('OPENAI_API_KEY'); 

    if (isViewerPremium && openAiKey && locationFilter) {
      try {
         const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'system',
              content: `You are a hype-man for ${locationFilter}, Nigeria. Look at these events: ${eventsData.slice(0, 5).map(e => e.title).join(', ')}. Give a 2-sentence "Vibe Check". Tell me where the action is.`
            }],
            max_tokens: 150
          })
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiInsights = aiData.choices?.[0]?.message?.content || null;
        }
      } catch (e) { console.error('AI Error', e); }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      posts: finalFeed, 
      events: eventsData,
      communities: communitiesData,
      ads: processedAds,
      ai_insights: aiInsights,
      is_premium: isViewerPremium,
      location_context: locationFilter || null
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Feed error:', error);
    return new Response(JSON.stringify({ error: error.message, success: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
