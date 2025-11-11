import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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

    // Пытаемся получить профиль
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    console.log('[Auth] Profile loaded:', profile, 'Error:', profileError?.message)

    // Fallback: используем данные из auth если профиля нет
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email || '',
        role: profile?.role || 'annotator',
        full_name: profile?.full_name || null
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

