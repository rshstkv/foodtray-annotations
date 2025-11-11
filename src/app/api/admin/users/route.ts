import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Helper: проверка роли admin
 */
async function checkAdminRole(supabase: any) {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return { authorized: false, error: 'Unauthorized', status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return { authorized: false, error: 'Forbidden: admin role required', status: 403 }
  }

  return { authorized: true, user }
}

/**
 * GET /api/admin/users
 * 
 * Получить список всех пользователей (только для admin)
 */
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Проверка роли admin
    const authCheck = await checkAdminRole(supabase)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
    }

    // Получить всех пользователей
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Admin] Error fetching users:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ users: profiles || [] })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/users
 * 
 * Создать нового пользователя (только для admin)
 * Body: { email: string, password: string, role?: 'admin' | 'annotator', full_name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка роли admin
    const authCheck = await checkAdminRole(supabase)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
    }

    const { email, password, role = 'annotator', full_name } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Создать service client для admin операций
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Создать пользователя через Admin API
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name }
    })

    if (error) {
      console.error('[Admin] Error creating user:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 })
    }

    // Обновить роль в profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role, full_name })
      .eq('id', data.user.id)

    if (profileError) {
      console.warn('[Admin] Profile update warning:', profileError.message)
    }

    console.log(`[Admin] User created: ${email} (${role})`)

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        full_name
      }
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

