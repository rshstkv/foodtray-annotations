import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  console.log('[API /annotations/recognitions] Request received')
  try {
    const supabase = await createClient()
    console.log('[API /annotations/recognitions] Supabase client created')
    const searchParams = request.nextUrl.searchParams

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Filters
    const status = searchParams.get('status')
    const isMistake = searchParams.get('is_mistake')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const mainMin = searchParams.get('main_min')
    const mainMax = searchParams.get('main_max')
    const qualifyingMin = searchParams.get('qualifying_min')
    const qualifyingMax = searchParams.get('qualifying_max')
    const workflowState = searchParams.get('workflow_state')

    // Build query
    console.log('[API /annotations/recognitions] Building query with filters:', { status, workflowState, isMistake })
    let query = supabase
      .from('recognitions')
      .select(`
        id,
        recognition_id,
        recognition_date,
        workflow_state,
        is_mistake,
        annotator_notes
      `, { count: 'exact' })
    
    console.log('[API /annotations/recognitions] Initial query created')

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('workflow_state', status)
    }

    if (workflowState) {
      query = query.eq('workflow_state', workflowState)
    }

    if (isMistake && isMistake !== 'all') {
      query = query.eq('is_mistake', isMistake === 'true')
    }

    if (dateFrom) {
      query = query.gte('recognition_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('recognition_date', dateTo)
    }

    // Order and paginate
    query = query
      .order('recognition_date', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: recognitions, error, count } = await query

    if (error) {
      console.error('[API /annotations/recognitions] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch image counts for each recognition
    const recognitionIds = recognitions?.map(r => r.recognition_id) || []
    
    const { data: images } = await supabase
      .from('recognition_images')
      .select('recognition_id, photo_type, annotations(id, object_type, dish_index)')
      .in('recognition_id', recognitionIds)

    // Calculate counts
    const enrichedRecognitions = recognitions?.map(rec => {
      const recImages = images?.filter(img => img.recognition_id === rec.recognition_id) || []
      const mainImage = recImages.find(img => img.photo_type === 'Main')
      const qualifyingImage = recImages.find(img => img.photo_type === 'Qualifying')

      const mainCount = mainImage?.annotations?.filter((a: any) => a.dish_index !== null).length || 0
      const qualifyingCount = qualifyingImage?.annotations?.filter((a: any) => a.dish_index !== null).length || 0

      return {
        ...rec,
        status: rec.workflow_state,
        image_count: recImages.length,
        annotation_count: recImages.reduce((sum, img) => sum + (img.annotations?.length || 0), 0),
        food_annotation_count: recImages.reduce((sum, img) => 
          sum + (img.annotations?.filter((a: any) => a.object_type === 'food').length || 0), 0
        ),
        main_count: mainCount,
        qualifying_count: qualifyingCount,
      }
    }) || []

    // Apply main/qualifying filters after enrichment
    let filteredRecognitions = enrichedRecognitions

    if (mainMin) {
      filteredRecognitions = filteredRecognitions.filter(r => (r.main_count || 0) >= parseInt(mainMin))
    }
    if (mainMax) {
      filteredRecognitions = filteredRecognitions.filter(r => (r.main_count || 0) <= parseInt(mainMax))
    }
    if (qualifyingMin) {
      filteredRecognitions = filteredRecognitions.filter(r => (r.qualifying_count || 0) >= parseInt(qualifyingMin))
    }
    if (qualifyingMax) {
      filteredRecognitions = filteredRecognitions.filter(r => (r.qualifying_count || 0) <= parseInt(qualifyingMax))
    }

    const totalPages = Math.ceil((count || 0) / limit)

    return NextResponse.json({
      data: filteredRecognitions,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
      },
    })
  } catch (error) {
    console.error('[API /annotations/recognitions] Exception:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
