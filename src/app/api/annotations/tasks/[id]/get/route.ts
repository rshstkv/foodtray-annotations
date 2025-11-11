import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/tasks/[id]/get
 * 
 * Получить конкретную задачу по recognition_id
 * Используется для прямых ссылок на задачи
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recognition_id } = await params

    if (!recognition_id) {
      return NextResponse.json(
        { error: 'recognition_id is required' },
        { status: 400 }
      )
    }

    // Получаем recognition
    const { data: recognition, error: recognitionError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognition_id)
      .single()

    if (recognitionError || !recognition) {
      return NextResponse.json(
        { error: 'Recognition not found' },
        { status: 404 }
      )
    }

    // Получаем task_type
    const { data: stage, error: stageError } = await supabase
      .from('workflow_stages')
      .select(`
        id,
        stage_order,
        name,
        is_optional,
        task_types (
          id,
          code,
          name,
          description,
          ui_config
        )
      `)
      .eq('id', recognition.current_stage_id)
      .single()

    if (stageError || !stage) {
      return NextResponse.json(
        { error: 'Workflow stage not found' },
        { status: 404 }
      )
    }

    // Получаем images с annotations
    const { data: images, error: imgError } = await supabase
      .from('recognition_images')
      .select(`
        *,
        annotations (*)
      `)
      .eq('recognition_id', recognition_id)
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

    return NextResponse.json({
      recognition: recognition,
      images: imagesWithAnnotations,
      menu_all: recognition.menu_all || [],
      task_type: stage.task_types,
      stage: {
        id: stage.id,
        stage_order: stage.stage_order,
        name: stage.name,
        is_optional: stage.is_optional
      }
    })

  } catch (error) {
    console.error('Error in get task endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


