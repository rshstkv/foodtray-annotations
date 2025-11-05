import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/tasks/{id}/complete
 * 
 * Завершить текущий этап и перейти к следующему
 * Body:
 * {
 *   stage_id: number,
 *   changes: object (optional),
 *   move_to_next: boolean (default: true)
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
    
    const { stage_id, changes, move_to_next = true } = body

    if (!stage_id) {
      return NextResponse.json(
        { error: 'stage_id is required' },
        { status: 400 }
      )
    }

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

    // Получаем текущий stage
    const { data: currentStage, error: stageError } = await supabase
      .from('workflow_stages')
      .select('*')
      .eq('id', stage_id)
      .single()

    if (stageError || !currentStage) {
      return NextResponse.json(
        { error: 'Stage not found' },
        { status: 404 }
      )
    }

    // Получаем все annotations
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
        stage_id: stage_id,
        snapshot_type: 'stage_complete',
        data_snapshot: {
          recognition_id: recognitionId,
          correct_dishes: recognition.correct_dishes,
          annotations: annotations || [],
          status: recognition.status,
          is_mistake: recognition.is_mistake,
          has_modifications: recognition.has_modifications,
          tier: recognition.tier,
          stage_completed: currentStage.name
        },
        changes_summary: changes || {
          stage: currentStage.name,
          completed_at: new Date().toISOString()
        }
      })

    if (historyError) {
      console.error('Error creating history snapshot:', historyError)
      // Не прерываем, продолжаем
    }

    // Добавляем stage_id в completed_stages
    const completedStages = [...(recognition.completed_stages || []), stage_id]

    let updates: Record<string, unknown> = {
      completed_stages: completedStages
    }

    if (move_to_next) {
      // Ищем следующий этап
      const { data: nextStage } = await supabase
        .from('workflow_stages')
        .select('*')
        .gt('stage_order', currentStage.stage_order)
        .order('stage_order', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (nextStage) {
        // Проверяем skip_condition для следующего этапа
        let shouldSkip = false
        
        if (nextStage.skip_condition) {
          // Простая проверка skip_condition
          const condition = nextStage.skip_condition as Record<string, unknown>
          
          if (condition.field === 'main_count' && condition.equals_field === 'qualifying_count') {
            // Проверяем количество bbox
            const { data: stats } = await supabase
              .from('recognitions_with_stats')
              .select('main_count, qualifying_count')
              .eq('recognition_id', recognitionId)
              .single()
            
            if (stats && stats.main_count === stats.qualifying_count) {
              shouldSkip = true
            }
          } else if (condition.field === 'all_dishes_single_variant' && condition.equals === true) {
            // Проверяем что все блюда имеют только один вариант
            const allSingleVariant = recognition.correct_dishes.every(
              (dish: { Dishes: unknown[] }) => dish.Dishes && dish.Dishes.length === 1
            )
            shouldSkip = allSingleVariant
          }
        }

        if (shouldSkip) {
          // Рекурсивно пропускаем этот этап и ищем следующий
          // Добавляем пропущенный этап в completed_stages
          completedStages.push(nextStage.id)
          
          const { data: nextNextStage } = await supabase
            .from('workflow_stages')
            .select('*')
            .gt('stage_order', nextStage.stage_order)
            .order('stage_order', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (nextNextStage) {
            updates.current_stage_id = nextNextStage.id
            updates.workflow_state = 'pending'
          } else {
            // Больше нет этапов, завершаем
            updates.workflow_state = 'completed'
            updates.completed_at = new Date().toISOString()
            updates.current_stage_id = null
          }
        } else {
          // Переходим к следующему этапу
          updates.current_stage_id = nextStage.id
          updates.workflow_state = 'pending'
        }
        
        updates.completed_stages = completedStages
      } else {
        // Больше нет этапов, завершаем весь workflow
        updates.workflow_state = 'completed'
        updates.completed_at = new Date().toISOString()
        updates.current_stage_id = null
      }
    } else {
      // Не переходим автоматически, оставляем в текущем состоянии
      updates.workflow_state = 'pending'
    }

    // Обновляем recognition
    const { data: updatedRecognition, error: updateError } = await supabase
      .from('recognitions')
      .update(updates)
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

    return NextResponse.json({
      success: true,
      recognition: updatedRecognition,
      completed_stage: currentStage,
      next_stage: updates.current_stage_id ? await getStageById(updates.current_stage_id as number) : null
    })

  } catch (error) {
    console.error('Unexpected error in tasks/complete:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Вспомогательная функция
async function getStageById(stageId: number) {
  const { data } = await supabase
    .from('workflow_stages')
    .select('*')
    .eq('id', stageId)
    .single()
  return data
}

