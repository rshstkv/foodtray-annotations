import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/{recognition_id}/skip
 * 
 * Пропускает задачу - освобождает и возвращает в pending
 * Явное действие аннотатора (кнопка "Пропустить")
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recognitionId } = await params
    
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

    // Сбрасываем assigned_to и last_activity_at
    const { error: updateError } = await supabase
      .from('recognitions')
      .update({
        assigned_to: null,
        last_activity_at: null,
        workflow_state: 'pending' // Явно возвращаем в pending
      })
      .eq('recognition_id', recognitionId)

    if (updateError) {
      console.error('Error skipping task:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Логируем действие
    await supabase
      .from('recognition_history')
      .insert({
        recognition_id: recognitionId,
        stage_id: recognition.current_stage_id,
        snapshot_type: 'manual_save',
        data_snapshot: {},
        changes_summary: {
          action: 'task_skipped',
          timestamp: new Date().toISOString()
        }
      })

    return NextResponse.json({
      success: true,
      message: 'Task skipped successfully'
    })

  } catch (error) {
    console.error('Unexpected error in task skip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

