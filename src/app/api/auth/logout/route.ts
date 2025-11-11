import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/auth/logout
 * 
 * Выход из системы
 */
export async function POST() {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('[Auth] Logout error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('[Auth] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

