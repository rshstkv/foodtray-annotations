import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/[id]/defer-to-edit
 * 
 * Переводит задачу в edit mode без переключения на эту задачу.
 * Пользователь остается в quick mode и получает следующую задачу.
 * 
 * Логика:
 * - validation_mode = 'edit'
 * - workflow_state = 'pending'
 * - Остается в task_queue = 'dish_validation'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id

    // Обновляем recognition
    const { data, error } = await supabase
      .from('recognitions')
      .update({ 
        validation_mode: 'edit',
        workflow_state: 'pending',
        // Сбрасываем assignment чтобы задача вернулась в общий пул
        assigned_to: null,
        started_at: null
      })
      .eq('recognition_id', recognitionId)
      .select()
      .single()

    if (error) {
      console.error('Error deferring task to edit:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Recognition not found' },
        { status: 404 }
      )
    }

    console.log(`Task ${recognitionId} deferred to edit mode`)

    return NextResponse.json({
      success: true,
      message: 'Task deferred to edit mode',
      data
    })

  } catch (error) {
    console.error('Unexpected error in defer-to-edit:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

