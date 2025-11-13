import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/admin/export
 * 
 * Экспорт аннотаций в JSON формате
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка авторизации
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверка роли
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Получение параметров фильтрации
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    // Построение запроса на задачи (с task_scope для получения modified_dishes)
    let tasksQuery = supabase
      .from('tasks')
      .select('id, recognition_id, status, assigned_to, task_scope, validated_state')

    if (userId && userId !== 'all') {
      tasksQuery = tasksQuery.eq('assigned_to', userId)
    }

    if (status && status !== 'all') {
      tasksQuery = tasksQuery.eq('status', status)
    }

    const { data: tasks, error: tasksError } = await tasksQuery

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ error: 'No tasks found' }, { status: 404 })
    }

    // Получить recognition_ids
    const recognitionIds = [...new Set(tasks.map(t => t.recognition_id))]

    // Получить recognitions
    const { data: recognitions, error: recognitionsError } = await supabase
      .from('recognitions')
      .select('*')
      .in('recognition_id', recognitionIds)

    if (recognitionsError) {
      return NextResponse.json({ error: recognitionsError.message }, { status: 500 })
    }

    // Получить images для этих recognitions
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('*')
      .in('recognition_id', recognitionIds)

    if (imagesError) {
      return NextResponse.json({ error: imagesError.message }, { status: 500 })
    }

    // Получить image_ids
    const imageIds = (images || []).map(img => img.id)

    // Получить ВСЕ аннотации для этих изображений (включая новые и обновленные)
    const { data: annotations, error: annotationsError } = await supabase
      .from('annotations')
      .select('*')
      .in('image_id', imageIds)
      .eq('is_deleted', false) // Только активные аннотации

    if (annotationsError) {
      return NextResponse.json({ error: annotationsError.message }, { status: 500 })
    }

    // Формирование результата
    const exportData = {
      exported_at: new Date().toISOString(),
      filters: {
        user_id: userId || 'all',
        status: status || 'all',
      },
      stats: {
        tasks_count: tasks.length,
        recognitions_count: recognitions?.length || 0,
        images_count: images?.length || 0,
        annotations_count: annotations?.length || 0,
      },
      data: (recognitions || []).map(recognition => {
        const recognitionImages = (images || []).filter(img => img.recognition_id === recognition.recognition_id)
        const recognitionTasks = tasks.filter(t => t.recognition_id === recognition.recognition_id)
        
        // Приоритет 1: Использовать validated_state если есть завершенные этапы
        const taskWithValidation = recognitionTasks.find(t => 
          t.validated_state && Object.keys(t.validated_state.steps).length > 0
        )
        
        let finalDishes = recognition.correct_dishes
        let annotationsByImageId: { [key: string]: any[] } = {}
        let changesHistory: any[] = []

        if (taskWithValidation?.validated_state) {
          // Используем данные из последнего завершенного этапа
          const completedSteps = Object.entries(taskWithValidation.validated_state.steps)
          
          if (completedSteps.length > 0) {
            // Последний завершенный этап содержит финальное состояние
            const [lastStepId, lastStepSnapshot] = completedSteps[completedSteps.length - 1] as [string, any]
            finalDishes = lastStepSnapshot.snapshot.dishes
            annotationsByImageId = lastStepSnapshot.snapshot.annotations
            
            // Собрать полную историю изменений из всех этапов
            changesHistory = completedSteps.flatMap(([stepId, snapshot]: [string, any]) => 
              snapshot.changes_log.map((change: any) => ({ ...change, step_id: stepId }))
            )
            
            console.log(`[export] Using validated_state for recognition ${recognition.recognition_id}: ${completedSteps.length} step(s), ${changesHistory.length} change(s)`)
          }
        } else {
          // Fallback: использовать текущие данные из БД (старая логика)
          const taskWithModifications = recognitionTasks.find(t => t.task_scope?.modified_dishes) || recognitionTasks[0]
          finalDishes = taskWithModifications?.task_scope?.modified_dishes || recognition.correct_dishes
          
          // Группировать аннотации по image_id
          for (const image of recognitionImages) {
            const imageAnnotations = (annotations || []).filter(ann => 
              ann.image_id === image.id && !ann.is_deleted
            )
            if (imageAnnotations.length > 0) {
              annotationsByImageId[image.id] = imageAnnotations
            }
          }
          
          console.log(`[export] Using fallback data for recognition ${recognition.recognition_id}`)
        }

        // Формируем images массив из annotationsByImageId
        const exportImages = recognitionImages.map(image => {
          const imageAnnotations = annotationsByImageId[image.id] || []
          
          return {
            image_id: image.id,
            image_type: image.image_type,
            storage_path: image.storage_path,
            width: image.width,
            height: image.height,
            annotations: imageAnnotations.map(ann => ({
              id: ann.id,
              object_type: ann.object_type,
              object_subtype: ann.object_subtype,
              dish_index: ann.dish_index,
              custom_dish_name: ann.custom_dish_name,
              bbox: {
                x1: ann.bbox_x1,
                y1: ann.bbox_y1,
                x2: ann.bbox_x2,
                y2: ann.bbox_y2,
              },
              is_overlapped: ann.is_overlapped,
              source: ann.source,
              created_by: ann.created_by,
              updated_by: ann.updated_by,
              created_at: ann.created_at,
              updated_at: ann.updated_at,
            })),
          }
        })
        
        return {
          recognition_id: recognition.recognition_id,
          recognition_date: recognition.recognition_date,
          validated_dishes: finalDishes, // Финальная версия после валидации
          original_dishes: recognition.correct_dishes, // Оригинальная версия из Qwen
          correct_dishes: finalDishes, // Backward compatibility
          menu_all: recognition.menu_all,
          images: exportImages,
          changes_history: changesHistory, // Полная история изменений
        }
      }),
    }

    // Возврат JSON с правильными заголовками
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="export_${userId || 'all'}_${Date.now()}.json"`,
      },
    })
  } catch (error) {
    console.error('[API] Error exporting data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

