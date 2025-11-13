import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/tasks/[id]
 * 
 * Получить данные задачи для аннотирования
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    
    // Проверка авторизации
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: taskId } = await params

    // Получить задачу
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Проверка доступа (только назначенный пользователь или админ)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'
    if (!isAdmin && task.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Получить recognition
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', task.recognition_id)
      .single()

    if (recError || !recognition) {
      return NextResponse.json({ error: 'Recognition not found' }, { status: 404 })
    }

    // Получить images
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('*')
      .eq('recognition_id', task.recognition_id)

    if (imagesError) {
      return NextResponse.json({ error: 'Failed to load images' }, { status: 500 })
    }

    // Получить annotations
    const { data: annotations, error: annotationsError } = await supabase
      .from('annotations')
      .select('*')
      .in('image_id', (images || []).map(img => img.id))

    if (annotationsError) {
      return NextResponse.json({ error: 'Failed to load annotations' }, { status: 500 })
    }

    // DEBUG: Проверяем аннотации для dish_index 3 (блюдо #4)
    const dish4Annotations = (annotations || []).filter(a => a.object_type === 'dish' && a.dish_index === 3)
    console.log('[API GET task] Dish #4 annotations:', dish4Annotations.map(a => ({
      id: a.id.substring(0, 8),
      dish_index: a.dish_index,
      custom_dish_name: a.custom_dish_name,
      is_deleted: a.is_deleted
    })))

    return NextResponse.json({
      task,
      recognition,
      images: images || [],
      annotations: annotations || [],
    })
  } catch (error) {
    console.error('[API] Error fetching task:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
