import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- CONFIGURATION ---
// These are the "Ghost" accounts that will host the events
const ORGANIZERS = [
  { email: 'pulse@ahmia.app', name: 'Lagos Nightlife', type: 'party', avatar: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30' },
  { email: 'tech@ahmia.app', name: 'Tech Insider', type: 'tech', avatar: 'https://images.unsplash.com/photo-1531482615713-2afd69097998' },
  { email: 'concerts@ahmia.app', name: 'TicketMaster NG', type: 'music', avatar: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745' }
];

// High-quality event templates
const EVENT_TEMPLATES = [
  {
    title: "Davido Timeless Tour - Lagos Finale",
    category: "Music",
    description: "The biggest concert of the year. Experience the Timeless album live at Eko Hotel.",
    location: "Eko Hotel & Suites, Victoria Island, Lagos",
    lat: 6.4253, lng: 3.4219,
    image_url: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14",
    price: 15000,
    organizer_idx: 2
  },
  {
    title: "Mainland Block Party",
    category: "Party",
    description: "Vibes, food, and non-stop energy. The block is hot!",
    location: "Muri Okunola Park, Lagos",
    lat: 6.4312, lng: 3.4250,
    image_url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7",
    price: 5000,
    organizer_idx: 0
  },
  {
    title: "Abuja Tech DevFest",
    category: "Tech",
    description: "Connect with developers, founders, and VCs. Free food and swag!",
    location: "International Conference Centre, Abuja",
    lat: 9.0579, lng: 7.4951,
    image_url: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678",
    price: 0,
    organizer_idx: 1
  },
  {
    title: "Sunday Beach Vibe",
    category: "Chill",
    description: "Relax by the ocean. Cocktails and Afro-house music.",
    location: "Landmark Beach, Lagos",
    lat: 6.4200, lng: 3.4350,
    image_url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
    price: 2000,
    organizer_idx: 0
  },
  {
    title: "Startup Grind: Fundraising 101",
    category: "Tech",
    description: "Learn how to raise your pre-seed round from top Nigerian investors.",
    location: "CcHub, Yaba, Lagos",
    lat: 6.5160, lng: 3.3850,
    image_url: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7",
    price: 0,
    organizer_idx: 1
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // MUST use Service Role to create users
    );

    console.log("🌱 Starting Content Seed...");

    // 1. ENSURE ORGANIZERS EXIST
    const organizerIds = [];
    
    for (const org of ORGANIZERS) {
      // Check if user exists (by email)
      const { data: users } = await supabase.auth.admin.listUsers();
      let userId = users.users.find(u => u.email === org.email)?.id;

      if (!userId) {
        console.log(`Creating host: ${org.name}`);
        const { data: newUser, error } = await supabase.auth.admin.createUser({
          email: org.email,
          password: 'password123', // Dummy password
          email_confirm: true,
          user_metadata: { full_name: org.name }
        });
        if (error) throw error;
        userId = newUser.user.id;

        // Create Profile
        await supabase.from('profiles').insert({
          user_id: userId,
          display_name: org.name,
          username: org.name.replace(/\s+/g, '').toLowerCase(),
          avatar_url: org.avatar,
          is_verified: true, // Give them a blue tick
          bio: `Official account for ${org.name}`
        });
      }
      organizerIds.push(userId);
    }

    // 2. GENERATE EVENTS (Relative Dates)
    const eventsToInsert = [];
    const today = new Date();
    
    // We create 3 versions of each event template with different dates/locations to fill the map
    for (let i = 0; i < 3; i++) {
        for (const tmpl of EVENT_TEMPLATES) {
            // Randomize date: Today + random 0-10 days
            const eventDate = new Date(today);
            eventDate.setDate(today.getDate() + Math.floor(Math.random() * 10));
            eventDate.setHours(18 + Math.floor(Math.random() * 4), 0, 0); // Evening times

            // Jitter location slightly so they don't stack on map
            const jitterLat = (Math.random() - 0.5) * 0.02;
            const jitterLng = (Math.random() - 0.5) * 0.02;

            eventsToInsert.push({
                user_id: organizerIds[tmpl.organizer_idx],
                title: tmpl.title,
                description: tmpl.description,
                category: tmpl.category,
                start_date: eventDate.toISOString(),
                end_date: new Date(eventDate.getTime() + 4 * 60 * 60 * 1000).toISOString(), // +4 hours
                location: tmpl.location,
                latitude: tmpl.lat + jitterLat,
                longitude: tmpl.lng + jitterLng,
                image_url: tmpl.image_url,
                price: tmpl.price,
                currency: 'NGN',
                is_sponsored: Math.random() > 0.8, // 20% chance of being sponsored
                match_score: Math.floor(Math.random() * 20) + 80 // Fake high match score
            });
        }
    }

    // 3. INSERT INTO DB
    const { error: insertError } = await supabase.from('events').insert(eventsToInsert);
    if (insertError) throw insertError;

    console.log(`✅ Successfully seeded ${eventsToInsert.length} events!`);

    return new Response(JSON.stringify({ success: true, count: eventsToInsert.length }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Seeding error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
