import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service‑role client – can verify tokens and manage users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Helper to check if user is admin or super_admin
async function isAuthorised(userId: string) {
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .in('role', ['admin', 'super_admin'])
    .limit(1)
  return data && data.length > 0
}

// ── GET – list all users ──────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized – missing token' }, { status: 401 })
  }
  const token = authHeader.split(' ')[1]

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized – invalid token' }, { status: 401 })
  }

  if (!(await isAuthorised(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all users and their roles
  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const { data: allRoles } = await supabaseAdmin.from('user_roles').select('*')

  const enriched = users?.users.map(u => ({
    id: u.id,
    email: u.email,
    fullName: u.user_metadata?.full_name || '',
    roles: allRoles?.filter(r => r.user_id === u.id).map(r => r.role) || [],
  })) || []

  return NextResponse.json(enriched)
}

// ── POST – create a new user ─────────────────────────────────
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized – missing token' }, { status: 401 })
  }
  const token = authHeader.split(' ')[1]

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized – invalid token' }, { status: 401 })
  }

  if (!(await isAuthorised(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password, fullName, roles } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  await supabaseAdmin.from('app_users').insert({
    id: newUser.user.id,
    full_name: fullName || email,
    role: roles.join(','),
  })

  if (roles && roles.length > 0) {
    const roleRows = roles.map((role: string) => ({
      user_id: newUser.user.id,
      role,
    }))
    await supabaseAdmin.from('user_roles').insert(roleRows)
  }

  return NextResponse.json({ success: true, userId: newUser.user.id })
}