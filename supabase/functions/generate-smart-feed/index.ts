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
    
    const locationFilter = city || location_name || null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. FETCH VIEWER CONTEXT (Profile, Friends, Active Features)
    const [profileRes, friendsRes, viewerFeaturesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`),
      // Fetch Viewer's Active Premium Features
      supabase.from('premium_features')
        .select('feature_type')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
    ]);

    const profile = profileRes.data || { is_premium: false, interests: [] };
    
    // Map viewer features to a simple Set for fast lookup
    const viewerFeatures = new Set(viewerFeaturesRes.data?.map((f: any) => f.feature_type) || []);
    const hasFullPackage = viewerFeatures.has('full_package');
    const isViewerPremium = profile.is_premium || hasFullPackage || viewerFeatures.size > 0;

    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    // 2. FETCH CONTENT POOL
    // We fetch a larger pool (70 posts, 50 events) to let the algorithm filter down to the best gems
    const [eventsRes, communitiesRes, postsRes] = await Promise.all([
      // Events: Select user_id (creator) to check for boosts
      supabase.from('events')
        .select(`*, event_attendees(count)`)
        .gt('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(50),

      supabase.from('communities')
        .select(`*, community_members!inner(user_id, role)`)
        .order('member_count', { ascending: false })
        .limit(30),

      supabase.from('social_posts')
        .select(`*, profiles (display_name, avatar_url, user_id)`)
        .order('created_at', { ascending: false })
        .limit(70)
    ]);

    const events = eventsRes.data || [];
    const communities = communitiesRes.data || [];
    const posts = postsRes.data || [];

    // 3. FETCH CREATOR "BOOST" STATUS (The Intelligent Layer)
    // We need to know which creators have paid for boosts
    const creatorIds = new Set([
      ...events.map((e: any) => e.user_id), // Event Creators
      ...posts.map((p: any) => p.user_id)   // Post Authors
    ].filter(Boolean));

    let boostedCreators = new Set<string>(); // Users with 'profile_boost'
    let boostedEventCreators = new Set<string>(); // Users with 'event_boost'

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

    // 4. SOCIAL GRAPH (Mutual Discovery & Facepiles)
    let friendLikedPosts = new Set<string>();
    let friendAttendanceMap = new Map<string, string[]>(); // Map event_id -> [friend_avatar_urls]

    if (friendIds.length > 0) {
      const [fLikes, fAttendance] = await Promise.all([
        supabase.from('post_likes').select('post_id').in('user_id', friendIds).limit(100),
        // FETCH FRIEND FACES for events
        supabase.from('event_attendees')
          .select('event_id, user_id, profiles(avatar_url)')
          .in('user_id', friendIds)
      ]);

      fLikes.data?.forEach((l: any) => friendLikedPosts.add(l.post_id));
      
      // Group friend avatars by event
      fAttendance.data?.forEach((a: any) => {
        const avatar = a.profiles?.avatar_url;
        if (avatar) {
          const current = friendAttendanceMap.get(a.event_id) || [];
          if (current.length < 3) { // Limit to 3 faces per card
            current.push(avatar);
            friendAttendanceMap.set(a.event_id, current);
          }
        }
      });
     }

    // --- ALGORITHMIC PROCESSING ---

    // A. POSTS ALGORITHM (Profile Boost Logic)
    const feedData = posts.map((post: any) => {
      let score = 0;
      
      // Base Score
      const hoursOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
      score -= Math.min(hoursOld * 0.5, 20); // Decay
      score += (post.likes_count || 0) * 0.5;
      
      // Friends (Always priority)
      if (friendIds.includes(post.user_id)) score += 30;

      // >>> INTELLIGENT BOOST: PROFILE VISIBILITY <<<
      const authorHasBoost = boostedCreators.has(post.user_id);
      
      if (authorHasBoost) {
        // Rule: Only boost to strangers if there is SOME relevance (Location or Mutuals)
        const isLocal = post.location && city && post.location.includes(city);
        
        if (isLocal) {
          score += 40; // Massive boost for local discovery
        } else {
          score += 15; // General visibility boost
        }
        
        // "Profile Badge" effect: always ensure they don't get buried
        if (score < 10) score = 10;
      }

      // Premium Viewer Benefits (Wanderlust Discovery)
      if (isViewerPremium) {
         if (friendLikedPosts.has(post.id) && !friendIds.includes(post.user_id)) {
           score += 25; // "Friend liked this"
         }
      }

      return { 
        ...post, 
        type: 'post', 
        sortScore: score,
        profiles: post.profiles || { display_name: 'Unknown User', avatar_url: null, user_id: post.user_id }
      };
    }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40);

    // B. EVENTS ALGORITHM (Event Boost Logic)
    const { data: userAttendance } = await supabase.from('event_attendees').select('event_id').eq('user_id', user_id);
    const attendingEventIds = new Set(userAttendance?.map(a => a.event_id) || []);

    const eventsData = events.map((event: any) => {
      let matchScore = 50; 

      // 1. Distance Logic (Wanderlust)
      if (user_lat && user_long && event.latitude && event.longitude) {
        const distance = calculateDistance(user_lat, user_long, event.latitude, event.longitude);
        
        // Premium Viewers see further
        const maxDist = isViewerPremium ? 150 : 75; 
        
        if (distance < 25) matchScore += 40;
        else if (distance < maxDist) matchScore += 20;
        else matchScore -= 20;
      }

      // 2. Interest Matching
      let interestMatch = false;
      if (profile.interests && event.category) {
        const userInterests = profile.interests.map((i: string) => i.toLowerCase());
        if (userInterests.includes(event.category.toLowerCase())) {
          matchScore += 25;
          interestMatch = true;
        }
      }

      // >>> INTELLIGENT BOOST: EVENT VISIBILITY (20x) <<<
      const creatorHasBoost = boostedEventCreators.has(event.user_id);
      
      if (creatorHasBoost) {
        if (interestMatch) {
           // INTELLIGENT SUGGESTION: Match found + Paid Boost = EXPLOSIVE VISIBILITY
           matchScore += 100; // Guarantee top slot
        } else {
           // Paid boost but no interest match? Smaller boost (Don't spam irrelevant users)
           matchScore += 50; 
        }
      }

      // 3. Nigerian Context
      const nigerianKeywords = ['owambe', 'party', 'tech', 'lagos', 'abuja', 'vibes', 'cruise', 'wedding'];
      if (nigerianKeywords.some(k => event.title.toLowerCase().includes(k))) matchScore += 15;

      return {
        ...event,
        type: 'event',
        match_score: Math.min(matchScore, 100), // Cap for UI, but sort uses raw score
        raw_score: matchScore, // Internal score for debugging
        attendee_count: event.event_attendees?.[0]?.count || 0,
        is_attending: attendingEventIds.has(event.id),
        // NEW: Inject Friend Faces
        friend_images: friendAttendanceMap.get(event.id) || [], 
        is_sponsored: event.is_boosted || (creatorHasBoost && interestMatch) // Mark as sponsored if boosted
      };
    }).sort((a: any, b: any) => b.raw_score - a.raw_score);

    // C. COMMUNITIES (Standard Logic)
    const { data: userMemberships } = await supabase.from('community_members').select('community_id, role').eq('user_id', user_id);
    const membershipMap = new Map(userMemberships?.map(m => [m.community_id, m.role]) || []);

    const communitiesData = communities.map((community: any) => {
      let matchScore = 40;
      if (membershipMap.has(community.id)) matchScore += 30;
      // Premium Viewers see Exclusive communities
      if (isViewerPremium && (community.name.includes('Exclusive') || community.name.includes('Premium'))) matchScore += 20;
      
      return {
        ...community,
        type: 'community',
        match_score: Math.min(matchScore, 100),
        is_member: membershipMap.has(community.id),
        my_role: membershipMap.get(community.id) || null
      };
    }).sort((a: any, b: any) => b.match_score - a.match_score);

    // 5. USER ADS (Targeting Regular Users Only)
    // Only fetch if viewer is NOT premium/full_package
    let processedAds: any[] = [];
    
    if (!hasFullPackage && !isViewerPremium) {
       const { data: rawAds } = await supabase
        .from('user_ads')
        .select('*')
        .eq('status', 'active') 
        .limit(10);
        
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

    // Inject Ads
    const finalFeed: any[] = [];
    let adIndex = 0;
    feedData.forEach((item, index) => {
      if (processedAds.length > 0 && index > 0 && index % 6 === 0 && processedAds[adIndex]) {
        finalFeed.push(processedAds[adIndex]);
        adIndex = (adIndex + 1) % processedAds.length;
      }
      finalFeed.push(item);
    });

    // 6. AI INSIGHTS (Viewer Premium Benefit)
    let aiInsights = null;
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    
console.log("🔍 DEBUG VARIABLES:", {
  hasKey: !!groqApiKey, 
  location: locationFilter, 
  isPremium: isViewerPremium 
});
    
    if (isViewerPremium && groqApiKey && locationFilter) {
      try {
         // Helper to format events with descriptions safely
         const eventContext = eventsData.slice(0, 5)
            .map(e => `Event: ${e.title}. Details: ${e.description?.substring(0, 150) || 'No details'}`)
            .join('\n');
        
         const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{
              role: 'system',
              content: `You are a high-energy hype-man for ${locationFilter}, Nigeria. Here is the lineup of events happening soon: ${eventContext}
                
                Task: Read the "Details" for each event above. 
                Generate a 2-sentence "Vibe Check" that specifically mentions the coolest activity found in the descriptions. 
                Do not list the events. Just hype up the specific vibes (e.g., "Afro-beats", "Pool party", "Tech networking").`
            }],
            max_tokens: 150
          })
        });
        if (!aiResponse.ok) {
           // THIS WAS MISSING: Log why it failed if status is not 200
           const errorData = await aiResponse.text();
           console.error("❌ GROQ API Error:", errorData);
        } else {
          const aiData = await aiResponse.json();
          console.log("✅ OpenAI Success!"); // Confirm success
          aiInsights = aiData.choices?.[0]?.message?.content || null;
        }

      } catch (e) { 
        console.error('❌ AI Exception:', e); 
      }
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
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('Feed generation error:', error);
    return new Response(JSON.stringify({ error: error.message, success: false }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
