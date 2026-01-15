import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { AccessToken } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS preflight requests (Browser security check)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Initialize Supabase Client to verify the user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 3. Get the user from the Auth header
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized: You must be logged in to join a room.");
    }

    // 4. Parse the request body
    const { room_name, participant_name } = await req.json();

    if (!room_name) {
      throw new Error("Missing 'room_name' in request body.");
    }

    // 5. Get LiveKit Credentials from Env Vars
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    
    if (!apiKey || !apiSecret) {
      throw new Error("Server Error: LiveKit keys are not configured.");
    }

    // 6. Create the Token
    // We use the User ID as the identity so we can identify them in the room
    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id, 
      name: participant_name || user.email,
    });

    // 7. Grant Permissions (Join, Publish, Subscribe)
    at.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // 8. Return the token to the frontend
    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
