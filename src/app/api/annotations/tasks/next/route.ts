import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/annotations/tasks/next
 * 
 * Получить следующую задачу для работы
 * Query params:
 *   - task_type: код типа задачи (dish_validation, etc)
 *   - mode: режим валидации ('quick' | 'edit'), опционально
 *   - queue: тип очереди ('pending' | 'requires_correction'), default: 'pending'
 * 
 * Возвращает следующий доступный recognition с:
 * - recognition данными
 * - images и annotations
 * - menu_all
 * - task_type конфигурацией
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const searchParams = request.nextUrl.searchParams
    const taskTypeCode = searchParams.get('task_type')
    const modeParam = searchParams.get('mode') as 'quick' | 'edit' | null
    const queueType = searchParams.get('queue') || 'pending' // 'pending' | 'requires_correction'
    
    if (!taskTypeCode) {
      return NextResponse.json(
        { error: 'task_type parameter is required' },
        { status: 400 }
      )
    }

    console.log(`[TIMING] Request started for ${taskTypeCode}, mode=${modeParam}, queue=${queueType}`)

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
      .select('id, stage_order, name, is_optional')
      .eq('task_type_id', taskType.id)
      .single()

    if (stageError || !stage) {
      return NextResponse.json(
        { error: 'Workflow stage not found for this task type' },
        { status: 404 }
      )
    }

    // Получить текущего пользователя для проверки assignment
    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    // Строим запрос для поиска recognition
    // Ищем задачи которые:
    // 1. В нужной очереди (workflow_state)
    // 2. С нужным validation_mode (если указан)
    // 3. Либо не назначены (assigned_to IS NULL), либо назначены текущему пользователю
    // 4. Либо назначены давно (started_at старше 15 минут) - автоосвобождение
    const workflowState = queueType === 'requires_correction' ? 'requires_correction' : 'pending'
    
    let query = supabase
      .from('recognitions')
      .select('*')
      .eq('workflow_state', workflowState)
      .eq('current_stage_id', stage.id)

    // КРИТИЧНО: Фильтр по validation_mode если mode указан
    if (modeParam) {
      query = query.eq('validation_mode', modeParam)
    }

    // Фильтр по assignment: либо не назначена, либо назначена текущему пользователю, либо просрочена
    if (user) {
      query = query.or(`assigned_to.is.null,assigned_to.eq.${user.id},started_at.lt.${new Date(Date.now() - 15 * 60 * 1000).toISOString()}`)
    } else {
      query = query.or(`assigned_to.is.null,started_at.lt.${new Date(Date.now() - 15 * 60 * 1000).toISOString()}`)
        }

    query = query
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

    // ОПТИМИЗАЦИЯ: Получаем images с annotations одним запросом через JOIN
    const { data: images, error: imgError } = await supabase
      .from('recognition_images')
      .select(`
        *,
        annotations (*)
      `)
      .eq('recognition_id', recognition.recognition_id)
      .order('photo_type')

    if (imgError) {
      console.error('Error fetching images:', imgError)
      return NextResponse.json({ error: imgError.message }, { status: 500 })
    }

    // Преобразуем результат для совместимости
    const imagesWithAnnotations = (images || []).map(image => ({
      ...image,
      annotations: image.annotations || []
    }))

    // Обновляем started_at для предотвращения двойного назначения
    // Но НЕ меняем workflow_state - задача остается pending
    const { error: updateError } = await supabase
      .from('recognitions')
      .update({
        started_at: new Date().toISOString()
      })
      .eq('recognition_id', recognition.recognition_id)

    if (updateError) {
      console.error('Error updating started_at:', updateError)
      // Не прерываем выполнение, просто логируем
    }

    const totalTime = Date.now() - startTime
    console.log(`[TIMING] Total request time: ${totalTime}ms for recognition ${recognition.recognition_id}`)

    return NextResponse.json({
      recognition: recognition,
      images: imagesWithAnnotations,
      menu_all: recognition.menu_all || [],
      task_type: taskType,
      stage: stage
    })

  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`[TIMING] Error after ${totalTime}ms:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

