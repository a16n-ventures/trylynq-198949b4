import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedRequest {
  user_id: string;
  user_lat?: number;
  user_long?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, user_lat, user_long } = await req.json() as FeedRequest;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Initialize OpenAI only if key exists
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    const openai = openAIKey ? new OpenAIApi(new Configuration({ apiKey: openAIKey })) : null;

    // --- FETCH CONTEXT ---
    const [profileRes, friendsRes, adsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user_id).single(),
      supabase.from('friendships').select('addressee_id, requester_id').eq('status', 'accepted').or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`),
      supabase.from('advertisements').select('*, social_posts(*, profiles(*))').eq('is_active', true).limit(5)
    ]);

    const profile = profileRes.data || { is_premium: false, interests: [] };
    const ads = adsRes.data || [];
    
    // Flatten friends list
    const friendIds = friendsRes.data?.map((f: any) => 
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    ) || [];

    let feedData: any[] = [];
    let eventsData: any[] = [];

    // --- LOGIC FORK ---
    // Fallback to Standard if OpenAI key is missing or user is not premium
    if (!profile.is_premium || !openai) {
      // 👤 STANDARD USER (or System Fallback)
      const { data: posts } = await supabase
        .from('social_posts')
        .select(`*, profiles(display_name, avatar_url, user_id)`)
        .order('created_at', { ascending: false })
        .limit(40);

      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gt('start_date', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      // ✅ FIX: Add 'type' property so frontend filters don't remove them
      feedData = (posts || []).map(p => ({ ...p, type: 'post' }));
      eventsData = (events || []).map(e => ({ ...e, type: 'event' }));

    } else {
      // 💎 PREMIUM USER
      try {
        const inputContext = `Interests: ${profile.interests?.join(', ') || 'general'}. Propensity: ${profile.travel_propensity || 'High'}.`;
        const embeddingResponse = await openai.createEmbedding({
          model: 'text-embedding-3-small',
          input: inputContext,
        });
        const userVector = embeddingResponse.data.data[0].embedding;

        // Fetch Posts
        const { data: rawPosts } = await supabase
          .from('social_posts')
          .select(`*, profiles(display_name, avatar_url, user_id)`)
          .order('created_at', { ascending: false })
          .limit(100);

        if (rawPosts) {
          // Score and Sort
          feedData = rawPosts.map((post: any) => {
            let score = 0;
            if (friendIds.includes(post.user_id)) score += 30; // Prioritize friends
            score -= (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60); // Recency decay
            return { ...post, type: 'post', sortScore: score }; // ✅ Add 'type'
          }).sort((a: any, b: any) => b.sortScore - a.sortScore).slice(0, 40);
        }

        // Fetch Events (RPC)
        const { data: aiEvents, error: rpcError } = await supabase.rpc('match_content_smart', {
          query_embedding: userVector,
          user_lat: user_lat || null,
          user_long: user_long || null,
          travel_radius_km: (profile.travel_propensity || 0.5) * 500, 
          match_threshold: 0.60
        });

        if (rpcError) throw rpcError;
        eventsData = (aiEvents || []).map((e: any) => ({ ...e, type: 'event' }));

      } catch (err) {
        console.error("Premium Logic Failed, using fallback", err);
        // Fallback to standard feed if AI fails
        const { data: posts } = await supabase.from('social_posts').select('*').limit(20);
        feedData = (posts || []).map(p => ({ ...p, type: 'post' }));
      }
    }

    // --- AD INJECTION ---
    const finalFeed: any[] = [];
    let adIndex = 0;

    feedData.forEach((item, index) => {
      // Inject Ad every 6 items
      if (index > 0 && index % 6 === 0 && ads[adIndex]) {
        finalFeed.push({
          id: `ad-${ads[adIndex].id}`,
          type: 'ad', // ✅ Correct type for ads
          post_type: 'ad',
          content: ads[adIndex].social_posts?.content || ads[adIndex].description,
          image_url: ads[adIndex].social_posts?.image_url,
          profiles: ads[adIndex].social_posts?.profiles,
          link_url: ads[adIndex].link_url,
          created_at: new Date().toISOString()
        });
        adIndex = (adIndex + 1) % ads.length;
      }
      finalFeed.push(item);
    });

    return new Response(JSON.stringify({ 
      success: true, 
      posts: finalFeed,
      events: eventsData,
      is_premium: profile.is_premium 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
