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
 * Флаги:
 *   - bbox_error: Неправильные bbox (границы или привязка к блюду) → requires_correction
 *   - check_error: Исходные данные (чек) неполные/неверные → check_error_pending
 *   - manual_review: Сложный случай, требует ручного ревью → manual_review_pending
 *   - buzzer_present: На изображениях есть баззеры → buzzer_pending
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const recognitionId = params.id
    const body = await request.json()
    const { flag_type, reason } = body

    if (!flag_type) {
      return NextResponse.json(
        { error: 'flag_type is required' },
        { status: 400 }
      )
    }

    if (!['bbox_error', 'check_error', 'manual_review', 'buzzer_present'].includes(flag_type)) {
      return NextResponse.json(
        { error: 'Invalid flag_type. Must be: bbox_error, check_error, manual_review, or buzzer_present' },
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

