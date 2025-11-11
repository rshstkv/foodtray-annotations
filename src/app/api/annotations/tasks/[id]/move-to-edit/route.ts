import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/[id]/move-to-edit
 * 
 * Перевести задачу из quick mode в edit mode
 * Освобождает задачу (assigned_to = null) для назначения другому аннотатору
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    if (!id) {
      return NextResponse.json(
        { error: 'recognition_id is required' },
        { status: 400 }
      )
    }

    // Обновить validation_mode и освободить задачу
    const { error } = await supabase
      .from('recognitions')
      .update({
        validation_mode: 'edit',
        assigned_to: null,  // Освободить задачу для других пользователей
        started_at: null
      })
      .eq('recognition_id', id)

    if (error) {
      console.error('[move-to-edit] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[move-to-edit] Recognition ${id} moved to edit mode`)

    return NextResponse.json({ 
      message: 'Task moved to edit mode',
      recognition_id: id
    })
  } catch (error) {
    console.error('[move-to-edit] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

