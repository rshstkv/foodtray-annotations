import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { reason } = body

    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Обновляем task
    const { error } = await supabaseServer
      .from('tasks')
      .update({
        status: 'skipped',
        skipped_reason: reason || null,
        skipped_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .eq('assigned_to', user.id)

    if (error) {
      console.error('[tasks/skip] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      task_id: taskId,
    })

  } catch (error) {
    console.error('[tasks/skip] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

