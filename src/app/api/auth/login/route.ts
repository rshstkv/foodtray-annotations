import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/login
 * 
 * Авторизация пользователя через Supabase Auth
 * Body: { email: string, password: string }
 * 
 * Response: { user: { id, email, role }, session }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Авторизация через Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('[Auth] Login error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    // Используем service_role_key для получения профиля (обходим RLS)
    // Это безопасно, так как пользователь уже авторизован через Supabase Auth
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

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role, is_active, email, full_name')
      .eq('id', data.user.id)
      .single()

    if (profileError) {
      console.error('[Auth] Profile fetch error:', profileError.message)
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      )
    }

    if (!profile?.is_active) {
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 403 }
      )
    }

    console.log(`[Auth] User logged in: ${email} (${profile.role})`)

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile.role,
        full_name: profile.full_name
      },
      session: data.session
    })
  } catch (error) {
    console.error('[Auth] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

