import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admin can create users
  const { data: isAdmin } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, password, fullName, roles } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Create the auth user (Supabase Admin API)
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // auto‑confirm
    user_metadata: { full_name: fullName },
  })
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  // Insert into app_users (for backward compatibility)
  await supabaseAdmin.from('app_users').insert({
    id: newUser.user.id,
    full_name: fullName || email,
    role: roles.join(',')  // comma‑separated for legacy single‑column
  })

  // Insert selected roles
  if (roles && roles.length > 0) {
    const roleRows = roles.map((role: string) => ({
      user_id: newUser.user.id,
      role,
    }))
    await supabaseAdmin.from('user_roles').insert(roleRows)
  }

  return NextResponse.json({ success: true, userId: newUser.user.id })
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all users with their roles
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