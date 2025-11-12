import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// Проверка роли админа
async function checkAdminRole(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { authorized: false, error: 'Unauthorized', status: 401 }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { authorized: false, error: 'Forbidden: Admin role required', status: 403 }
  }

  return { authorized: true, user }
}

// Генерация случайного пароля
function generatePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

/**
 * POST /api/admin/users/[id]/password
 * 
 * Генерировать или обновить пароль пользователя (только для admin)
 * Body: { password?: string } - если не указан, генерируется автоматически
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseServer = await createClient()
    
    // Проверка роли admin
    const authCheck = await checkAdminRole(supabaseServer)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
    }

    const { id: userId } = await params
    const body = await request.json()
    const newPassword = body.password || generatePassword(12)

    // Проверяем что пользователь существует
    const adminClient = createAdminClient()
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Обновляем пароль через Supabase Admin API
    const { data, error } = await supabaseServer.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (error) {
      console.error('[Admin] Error updating password:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Admin] Password updated for user ${profile.email}`)

    return NextResponse.json({ 
      success: true,
      password: newPassword,
      user: {
        id: userId,
        email: profile.email,
        full_name: profile.full_name
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

