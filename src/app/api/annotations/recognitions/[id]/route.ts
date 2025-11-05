import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id

    // Получаем recognition (включая menu_all)
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    if (recError || !recognition) {
      return NextResponse.json({ error: 'Recognition not found' }, { status: 404 })
    }

    // menu_all теперь находится в recognitions
    const menuAll = recognition.menu_all || []

    // Получаем изображения
    const { data: images, error: imgError } = await supabase
      .from('recognition_images')
      .select('*')
      .eq('recognition_id', recognitionId)
      .order('photo_type')

    if (imgError) {
      return NextResponse.json({ error: imgError.message }, { status: 500 })
    }

    // Получаем аннотации для каждого изображения
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

    return NextResponse.json({
      recognition,
      images: imagesWithAnnotations,
      menu_all: menuAll
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id
    const body = await request.json()

    const { status, is_mistake, annotator_notes, correct_dishes, has_modifications } = body

    // Получаем текущее состояние ПЕРЕД обновлением для логирования
    const { data: currentRecognition } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    const updates: Record<string, unknown> = {}
    if (status !== undefined) updates.status = status
    if (is_mistake !== undefined) updates.is_mistake = is_mistake
    if (annotator_notes !== undefined) updates.annotator_notes = annotator_notes
    if (has_modifications !== undefined) updates.has_modifications = has_modifications
    if (correct_dishes !== undefined) {
      updates.correct_dishes = correct_dishes
      // Изменение correct_dishes - это модификация
      updates.has_modifications = true
    }

    const { data, error } = await supabase
      .from('recognitions')
      .update(updates)
      .eq('recognition_id', recognitionId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Логируем изменение в history если изменились важные поля
    const shouldLog = correct_dishes !== undefined || status === 'completed' || is_mistake !== undefined
    
    if (shouldLog && currentRecognition) {
      // Получаем аннотации для полного snapshot
      const { data: images } = await supabase
        .from('recognition_images')
        .select('id')
        .eq('recognition_id', recognitionId)

      const imageIds = (images || []).map((img: { id: number }) => img.id)
      
      const { data: annotations } = await supabase
        .from('annotations')
        .select('*')
        .in('image_id', imageIds)

      // Создаем snapshot
      await supabase
        .from('recognition_history')
        .insert({
          recognition_id: recognitionId,
          stage_id: data.current_stage_id || null,
          snapshot_type: 'manual_save',
          data_snapshot: {
            recognition_id: recognitionId,
            correct_dishes: data.correct_dishes,
            annotations: annotations || [],
            status: data.status,
            is_mistake: data.is_mistake,
            has_modifications: data.has_modifications,
            tier: data.tier
          },
          changes_summary: {
            changed_fields: Object.keys(updates),
            previous_values: {
              correct_dishes: currentRecognition.correct_dishes,
              status: currentRecognition.status,
              is_mistake: currentRecognition.is_mistake
            },
            updated_at: new Date().toISOString()
          }
        })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

