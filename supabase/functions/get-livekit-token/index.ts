import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple JWT creation for LiveKit (without external npm dependency)
function createLiveKitToken(apiKey: string, apiSecret: string, roomName: string, identity: string, participantName: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry
  
  const payload = {
    iss: apiKey,
    sub: identity,
    name: participantName,
    exp: exp,
    nbf: now - 5,
    iat: now,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const base64UrlEncode = (obj: object): string => {
    const json = JSON.stringify(obj);
    const base64 = btoa(json);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Create HMAC-SHA256 signature using Web Crypto API
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signingInput);

  // Synchronous crypto not available, so we'll use a simple approach
  // For production, use async crypto. For now, we return the unsigned token parts
  // and rely on LiveKit's SDK to handle it properly.
  
  // Actually, we need to make this async. Let's restructure.
  return signingInput; // Placeholder - we'll fix this with async
}

async function createLiveKitTokenAsync(apiKey: string, apiSecret: string, roomName: string, identity: string, participantName: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry
  
  const payload = {
    iss: apiKey,
    sub: identity,
    name: participantName,
    exp: exp,
    nbf: now - 5,
    iat: now,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const base64UrlEncode = (str: string): string => {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Create HMAC-SHA256 signature using Web Crypto API
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signingInput);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = new Uint8Array(signatureBuffer);
  
  // Convert to base64url
  let signatureBase64 = '';
  for (let i = 0; i < signatureArray.length; i++) {
    signatureBase64 += String.fromCharCode(signatureArray[i]);
  }
  const encodedSignature = btoa(signatureBase64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signingInput}.${encodedSignature}`;
}

serve(async (req) => {
  // 1. Handle CORS preflight requests
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
    const livekitUrl = Deno.env.get('LIVEKIT_URL');
    
    if (!apiKey || !apiSecret) {
      throw new Error("Server Error: LiveKit keys are not configured.");
    }

    // 6. Create the Token using Web Crypto API
    const token = await createLiveKitTokenAsync(
      apiKey, 
      apiSecret, 
      room_name, 
      user.id, 
      participant_name || user.email || 'Participant'
    );

    // 7. Return the token and URL to the frontend
    return new Response(JSON.stringify({ token, livekit_url: livekitUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
