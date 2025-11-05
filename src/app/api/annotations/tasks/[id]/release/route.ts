import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/{recognition_id}/release
 * 
 * Освобождает задачу - возвращает в pending состояние
 * Используется когда аннотатор решает пропустить задачу или выходит без завершения
 * 
 * Body: пустой или { reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recognitionId } = await params
    const body = await request.json().catch(() => ({}))
    
    // Получаем текущее состояние recognition
    const { data: recognition, error: fetchError } = await supabase
      .from('recognitions')
      .select('workflow_state, current_stage_id')
      .eq('recognition_id', recognitionId)
      .single()

    if (fetchError || !recognition) {
      return NextResponse.json(
        { error: 'Recognition not found' },
        { status: 404 }
      )
    }

    // Можем освободить только pending задачи
    if (recognition.workflow_state !== 'pending') {
      return NextResponse.json(
        { error: 'Can only release pending tasks' },
        { status: 400 }
      )
    }

    // Сбрасываем assigned_to и обновляем last_activity_at
    const { error: updateError } = await supabase
      .from('recognitions')
      .update({
        assigned_to: null,
        last_activity_at: null
      })
      .eq('recognition_id', recognitionId)

    if (updateError) {
      console.error('Error releasing task:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Логируем в recognition_history если есть причина
    if (body.reason) {
      await supabase
        .from('recognition_history')
        .insert({
          recognition_id: recognitionId,
          stage_id: recognition.current_stage_id,
          snapshot_type: 'manual_save',
          data_snapshot: {},
          changes_summary: {
            action: 'task_released',
            reason: body.reason,
            timestamp: new Date().toISOString()
          }
        })
    }

    return NextResponse.json({
      success: true,
      message: 'Task released successfully'
    })

  } catch (error) {
    console.error('Unexpected error in task release:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

