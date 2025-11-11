import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/[id]/flag
 * 
 * Отмечает задачу флагом и отправляет в соответствующую очередь
 * 
 * Body:
 *   - flag_type: 'bbox_error' | 'check_error' | 'manual_review' | 'buzzer_present'
 *   - reason?: string (опциональное описание проблемы)
 * 
 * Флаги (меняют task_queue и/или validation_mode):
 *   - bbox_error: → task_queue='dish_validation', validation_mode='edit'
 *   - check_error: Ошибка в чеке → task_queue='check_error' (edit mode)
 *   - other_items: Есть другие предметы → task_queue='other_items' (edit mode)
 *   - buzzer_present: Есть баззеры → task_queue='buzzer' (edit mode)
 * 
 * Задача всегда возвращается в workflow_state='pending'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id
    const body = await request.json()
    const { flag_type, reason } = body

    if (!flag_type) {
      return NextResponse.json(
        { error: 'flag_type is required' },
        { status: 400 }
      )
    }

    if (!['bbox_error', 'check_error', 'other_items', 'buzzer_present'].includes(flag_type)) {
      return NextResponse.json(
        { error: 'Invalid flag_type. Must be: bbox_error, check_error, other_items, or buzzer_present' },
        { status: 400 }
      )
    }

    // Используем PostgreSQL function для атомарной операции
    const { data, error } = await supabase.rpc('flag_task', {
      p_recognition_id: recognitionId,
      p_flag_type: flag_type,
      p_reason: reason || null,
    })

    if (error) {
      console.error('Error flagging task:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Логирование для аналитики
    console.log(`Task ${recognitionId} flagged as ${flag_type}${reason ? `: ${reason}` : ''}`)

    return NextResponse.json({
      success: true,
      message: `Task flagged as ${flag_type}`,
    })

  } catch (error) {
    console.error('Unexpected error in flag task:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

