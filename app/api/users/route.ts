import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

type CookieOption = { name: string; value: string; options?: Record<string, unknown> }

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

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: CookieOption[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

export async function GET(request: Request) {
  // Get the session token from the Authorization header or cookies
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value ||
    cookieStore.get('supabase-auth-token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized - no token' }, { status: 401 })
  }

  // Verify the token and get the user
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 })
  }

  if (!(await isAuthorised(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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