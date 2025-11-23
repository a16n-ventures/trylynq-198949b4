// supabase/functions/manage-user-role/index.ts
const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader);

// Verify caller is admin
const callerIsAdmin = await supabaseAdmin.rpc('has_role', { 
  _user_id: user.id, 
  _role: 'admin' 
});

if (!callerIsAdmin) {
  return new Response('Unauthorized', { status: 403 });
}

// Only then allow role update using SERVICE_ROLE_KEY
