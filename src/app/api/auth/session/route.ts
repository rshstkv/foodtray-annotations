import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/auth/session
 * 
 * Проверка текущей сессии пользователя
 * Возвращает данные пользователя или 401
 * 
 * Response: { user: { id, email, role, full_name } }
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Используем service_role_key для получения профиля (обходим RLS)
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
      .eq('id', user.id)
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

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: profile.role,
        full_name: profile.full_name
      }
    })
  } catch (error) {
    console.error('[Auth] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

