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
      .select('id, recognition_id, status, assigned_to, task_scope')

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
        
        // Найти задачу для этого recognition чтобы получить modified_dishes
        // Если есть несколько задач для одного recognition, приоритет задаче с modified_dishes
        const recognitionTasks = tasks.filter(t => t.recognition_id === recognition.recognition_id)
        const taskWithModifications = recognitionTasks.find(t => t.task_scope?.modified_dishes) || recognitionTasks[0]
        const modifiedDishes = taskWithModifications?.task_scope?.modified_dishes
        
        return {
          recognition_id: recognition.recognition_id,
          recognition_date: recognition.recognition_date,
          correct_dishes: modifiedDishes || recognition.correct_dishes, // Используем измененный чек если есть
          menu_all: recognition.menu_all,
          images: recognitionImages.map(image => {
            const imageAnnotations = (annotations || []).filter(ann => ann.image_id === image.id)
            
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
          }),
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

