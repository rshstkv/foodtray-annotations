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
 * GET /api/admin/users/[id]
 * 
 * Получить информацию о пользователе (только для admin)
 */
export async function GET(
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

    // Получить данные пользователя
    const adminClient = createAdminClient()
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Получить статистику задач пользователя
    const { data: taskStats } = await adminClient
      .from('tasks')
      .select('status')
      .eq('assigned_to', userId)

    const stats = {
      total: taskStats?.length || 0,
      completed: taskStats?.filter(t => t.status === 'completed').length || 0,
      in_progress: taskStats?.filter(t => t.status === 'in_progress').length || 0,
      pending: taskStats?.filter(t => t.status === 'pending').length || 0,
    }

    return NextResponse.json({ 
      user: profile,
      stats
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/users/[id]
 * 
 * Обновить данные пользователя (только для admin)
 * Body: { email?: string, full_name?: string, role?: string, is_active?: boolean }
 */
export async function PATCH(
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
    const body = await request.json()
    const { email, full_name, role, is_active } = body

    // Проверяем что пользователь существует
    const adminClient = createAdminClient()
    const { data: existingProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !existingProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Обновляем email через Admin API если изменился
    if (email && email !== existingProfile.email) {
      const { error: emailError } = await supabase.auth.admin.updateUserById(
        userId,
        { email }
      )

      if (emailError) {
        console.error('[Admin] Error updating email:', emailError.message)
        return NextResponse.json({ error: emailError.message }, { status: 400 })
      }
    }

    // Обновляем профиль
    const updateData: any = {}
    if (email !== undefined) updateData.email = email
    if (full_name !== undefined) updateData.full_name = full_name
    if (role !== undefined) updateData.role = role
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: updatedProfile, error: updateError } = await adminClient
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('[Admin] Error updating profile:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[Admin] User updated: ${userId}`)

    return NextResponse.json({ 
      success: true,
      user: updatedProfile
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/users/[id]
 * 
 * Удалить пользователя (только для admin)
 */
export async function DELETE(
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

    // Проверяем что пользователь не удаляет сам себя
    if (authCheck.user.id === userId) {
      return NextResponse.json(
        { error: 'Cannot delete yourself' },
        { status: 400 }
      )
    }

    // Удаляем пользователя через Admin API
    const { error } = await supabase.auth.admin.deleteUser(userId)

    if (error) {
      console.error('[Admin] Error deleting user:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Admin] User deleted: ${userId}`)

    return NextResponse.json({ 
      success: true
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

