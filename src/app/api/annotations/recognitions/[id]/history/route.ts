import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/recognitions/{id}/history
 * 
 * Получить историю всех изменений для recognition
 * Возвращает все snapshots с детальной информацией
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id

    // Получаем всю историю для recognition
    const { data: history, error: historyError } = await supabase
      .from('recognition_history')
      .select(`
        *,
        stage:workflow_stages(id, name, stage_order, task_type:task_types(code, name))
      `)
      .eq('recognition_id', recognitionId)
      .order('created_at', { ascending: true })

    if (historyError) {
      console.error('Error fetching history:', historyError)
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 }
      )
    }

    // Получаем текущий recognition для контекста
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    if (recError) {
      console.error('Error fetching recognition:', recError)
      return NextResponse.json(
        { error: recError.message },
        { status: 500 }
      )
    }

    // Получаем corrections если есть
    const { data: corrections } = await supabase
      .from('annotation_corrections')
      .select(`
        *,
        source_stage:workflow_stages!annotation_corrections_source_stage_id_fkey(id, name, stage_order),
        target_stage:workflow_stages!annotation_corrections_target_stage_id_fkey(id, name, stage_order)
      `)
      .eq('recognition_id', recognitionId)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      recognition_id: recognitionId,
      current_recognition: recognition,
      history: history || [],
      corrections: corrections || [],
      total_snapshots: (history || []).length
    })

  } catch (error) {
    console.error('Unexpected error in history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

