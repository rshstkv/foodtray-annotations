import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id

    // Получаем recognition
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    if (recError || !recognition) {
      return NextResponse.json({ error: 'Recognition not found' }, { status: 404 })
    }

    // Получаем menu_all из recognitions_raw
    const { data: recognitionRaw, error: rawError } = await supabase
      .from('recognitions_raw')
      .select('menu_all')
      .eq('recognition_id', recognitionId)
      .single()

    let menuAll = []
    if (!rawError && recognitionRaw) {
      menuAll = recognitionRaw.menu_all || []
    }

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

    const updates: any = {}
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

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

