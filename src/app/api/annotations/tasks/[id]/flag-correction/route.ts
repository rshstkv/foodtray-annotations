import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/{id}/flag-correction
 * 
 * Отметить необходимость исправления (обнаружена ошибка на другом этапе)
 * Body:
 * {
 *   correction_type: string (count_error, wrong_dish, missing_bbox, etc),
 *   source_stage_id: number (на каком этапе обнаружена),
 *   target_stage_id: number (на какой этап вернуться),
 *   reason: string (optional)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id
    const body = await request.json()
    
    const { correction_type, source_stage_id, target_stage_id, reason } = body

    if (!correction_type || !source_stage_id || !target_stage_id) {
      return NextResponse.json(
        { error: 'correction_type, source_stage_id, and target_stage_id are required' },
        { status: 400 }
      )
    }

    // Проверяем что recognition существует
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    if (recError || !recognition) {
      return NextResponse.json(
        { error: 'Recognition not found' },
        { status: 404 }
      )
    }

    // Создаем запись о необходимости исправления
    const { data: correction, error: correctionError } = await supabase
      .from('annotation_corrections')
      .insert({
        recognition_id: recognitionId,
        correction_type,
        source_stage_id,
        target_stage_id,
        reason: reason || null,
        status: 'pending'
      })
      .select()
      .single()

    if (correctionError) {
      console.error('Error creating correction:', correctionError)
      return NextResponse.json(
        { error: correctionError.message },
        { status: 500 }
      )
    }

    // Обновляем recognition: меняем workflow_state и current_stage_id
    const { data: updatedRecognition, error: updateError } = await supabase
      .from('recognitions')
      .update({
        workflow_state: 'requires_correction',
        current_stage_id: target_stage_id
      })
      .eq('recognition_id', recognitionId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating recognition:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Создаем snapshot в history
    const { error: historyError } = await supabase
      .from('recognition_history')
      .insert({
        recognition_id: recognitionId,
        stage_id: source_stage_id,
        snapshot_type: 'correction',
        data_snapshot: {
          recognition_id: recognitionId,
          correct_dishes: recognition.correct_dishes,
          status: recognition.status,
          correction_flagged: true,
          correction_type,
          target_stage_id
        },
        changes_summary: {
          action: 'correction_flagged',
          correction_type,
          reason: reason || 'No reason provided',
          flagged_at: new Date().toISOString()
        }
      })

    if (historyError) {
      console.error('Error creating history snapshot:', historyError)
      // Не прерываем выполнение
    }

    return NextResponse.json({
      success: true,
      correction,
      recognition: updatedRecognition
    })

  } catch (error) {
    console.error('Unexpected error in flag-correction:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

