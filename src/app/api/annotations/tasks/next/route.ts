import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/tasks/next
 * 
 * Получить следующую задачу для работы
 * Query params:
 *   - task_type: код типа задачи (count_validation, dish_selection, etc)
 *   - tier: уровень сложности (1-5), опционально
 * 
 * Возвращает следующий доступный recognition с:
 * - recognition данными
 * - images и annotations
 * - menu_all
 * - task_type конфигурацией
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const taskTypeCode = searchParams.get('task_type')
    const tierParam = searchParams.get('tier')
    
    if (!taskTypeCode) {
      return NextResponse.json(
        { error: 'task_type parameter is required' },
        { status: 400 }
      )
    }

    // Получаем task_type и соответствующий stage
    const { data: taskType, error: taskTypeError } = await supabase
      .from('task_types')
      .select('id, code, name, description, ui_config')
      .eq('code', taskTypeCode)
      .eq('is_active', true)
      .single()

    if (taskTypeError || !taskType) {
      return NextResponse.json(
        { error: 'Task type not found or inactive' },
        { status: 404 }
      )
    }

    // Получаем workflow_stage для этого task_type
    const { data: stage, error: stageError } = await supabase
      .from('workflow_stages')
      .select('id, stage_order, name, skip_condition, is_optional')
      .eq('task_type_id', taskType.id)
      .single()

    if (stageError || !stage) {
      return NextResponse.json(
        { error: 'Workflow stage not found for this task type' },
        { status: 404 }
      )
    }

    // Строим запрос для поиска recognition
    let query = supabase
      .from('recognitions')
      .select('*')
      .eq('workflow_state', 'pending')
      .eq('current_stage_id', stage.id)

    // Фильтр по tier если указан
    if (tierParam) {
      const tier = parseInt(tierParam)
      if (tier >= 1 && tier <= 5) {
        query = query.eq('tier', tier)
      }
    }

    // Сортировка: сначала по tier (проще = приоритет), потом по дате
    query = query
      .order('tier', { ascending: true })
      .order('recognition_date', { ascending: false })
      .limit(1)

    const { data: recognitions, error: recognitionError } = await query

    if (recognitionError) {
      console.error('Error fetching recognition:', recognitionError)
      return NextResponse.json(
        { error: recognitionError.message },
        { status: 500 }
      )
    }

    if (!recognitions || recognitions.length === 0) {
      return NextResponse.json(
        { 
          message: 'No tasks available',
          task_type: taskType.code,
          stage: stage.name
        },
        { status: 404 }
      )
    }

    const recognition = recognitions[0]

    // Получаем images с annotations
    const { data: images, error: imgError } = await supabase
      .from('recognition_images')
      .select('*')
      .eq('recognition_id', recognition.recognition_id)
      .order('photo_type')

    if (imgError) {
      console.error('Error fetching images:', imgError)
      return NextResponse.json({ error: imgError.message }, { status: 500 })
    }

    // Получаем annotations для каждого изображения
    const imagesWithAnnotations = await Promise.all(
      (images || []).map(async (image) => {
        const { data: annotations, error: annError } = await supabase
          .from('annotations')
          .select('*')
          .eq('image_id', image.id)
          .order('id')

        if (annError) {
          console.error('Error fetching annotations:', annError)
          return { ...image, annotations: [] }
        }

        return { ...image, annotations: annotations || [] }
      })
    )

    // Помечаем recognition как "in_progress" и записываем время начала
    const { error: updateError } = await supabase
      .from('recognitions')
      .update({
        workflow_state: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('recognition_id', recognition.recognition_id)

    if (updateError) {
      console.error('Error updating recognition status:', updateError)
      // Не прерываем выполнение, просто логируем
    }

    return NextResponse.json({
      recognition: {
        ...recognition,
        workflow_state: 'in_progress'
      },
      images: imagesWithAnnotations,
      menu_all: recognition.menu_all || [],
      task_type: taskType,
      stage: stage
    })

  } catch (error) {
    console.error('Unexpected error in tasks/next:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

