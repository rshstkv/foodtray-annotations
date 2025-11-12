import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

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
 * POST /api/admin/users/[id]/reset-password-email
 * 
 * Отправить письмо для сброса пароля пользователю (только для admin)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    // Проверка роли admin
    const authCheck = await checkAdminRole(supabase)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
    }

    const { id: userId } = await params

    // Получаем email пользователя
    const adminClient = createAdminClient()
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Отправляем письмо для сброса пароля
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/reset-password`,
    })

    if (error) {
      console.error('[Admin] Error sending reset password email:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Admin] Reset password email sent to: ${profile.email}`)

    return NextResponse.json({ 
      success: true,
      message: `Письмо для сброса пароля отправлено на ${profile.email}`
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

