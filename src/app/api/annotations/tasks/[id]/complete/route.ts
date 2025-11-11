import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/annotations/tasks/{id}/complete
 * 
 * Завершить задачу аннотирования
 * Body:
 * {
 *   changes: object (optional) - изменения в данных recognition
 *   task_queue: string (optional) - тип очереди для специализированных задач
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
    
    const { changes, task_queue } = body

    // Получить текущего пользователя для записи completed_by
    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    // Получаем текущий recognition
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

    // Получаем все annotations для snapshot
    const { data: images } = await supabase
      .from('recognition_images')
      .select('id')
      .eq('recognition_id', recognitionId)

    const imageIds = (images || []).map(img => img.id)
    
    const { data: annotations } = await supabase
      .from('annotations')
      .select('*')
      .in('image_id', imageIds)

    // Создаем snapshot в recognition_history
    const { error: historyError } = await supabase
      .from('recognition_history')
      .insert({
        recognition_id: recognitionId,
        stage_id: recognition.current_stage_id,
        snapshot_type: 'stage_complete',
        data_snapshot: {
          recognition_id: recognitionId,
          correct_dishes: recognition.correct_dishes,
          annotations: annotations || [],
          status: recognition.status,
          is_mistake: recognition.is_mistake,
          has_modifications: recognition.has_modifications,
          completed_at: new Date().toISOString()
        },
        changes_summary: changes || {
          completed_at: new Date().toISOString()
        }
      })

    if (historyError) {
      console.error('Error creating history snapshot:', historyError)
      // Не прерываем, продолжаем
    }

    // Определяем специализированные очереди
    const specializedQueues = ['bottle_orientation', 'other_items', 'overlap_marking', 'non_food_objects']
    
    if (task_queue && specializedQueues.includes(task_queue)) {
      // Для специализированных задач обновляем recognition_task_progress
      const { error: updateError } = await supabase
        .from('recognition_task_progress')
        .update({
          workflow_state: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('recognition_id', recognitionId)
        .eq('task_queue', task_queue)

      if (updateError) {
        console.error('Error updating recognition_task_progress:', updateError)
        return NextResponse.json(
          { error: 'Failed to complete specialized task' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        recognition_id: recognitionId,
        task_queue,
        workflow_state: 'completed'
      })
    } else {
      // Для dish_validation обновляем recognition
      const { error: updateError } = await supabase
        .from('recognitions')
        .update({
          workflow_state: 'completed',
          current_stage_id: null,
          completed_at: new Date().toISOString(),
          completed_by: user?.id || null, // Записываем кто завершил задачу
          assigned_to: null, // Очищаем назначение
          started_at: null,
          ...changes // Применяем дополнительные изменения если есть
        })
        .eq('recognition_id', recognitionId)

      if (updateError) {
        console.error('Error updating recognition:', updateError)
        return NextResponse.json(
          { error: 'Failed to complete task' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        recognition_id: recognitionId,
        workflow_state: 'completed'
      })
    }

  } catch (error) {
    console.error('Error in complete endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
