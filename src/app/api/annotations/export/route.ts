import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/export
 * 
 * Экспорт результатов аннотаций с версионностью
 * Query params:
 *   - format: json | csv (default: json)
 *   - tier: 1-5 (опционально)
 *   - workflow_state: pending | in_progress | completed | requires_correction (опционально)
 *   - from_date: ISO date string (опционально)
 *   - to_date: ISO date string (опционально)
 *   - include_history: true | false (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'json'
    const tier = searchParams.get('tier')
    const workflowState = searchParams.get('workflow_state')
    const fromDate = searchParams.get('from_date')
    const toDate = searchParams.get('to_date')
    const includeHistory = searchParams.get('include_history') === 'true'

    // Строим запрос
    let query = supabase
      .from('recognitions')
      .select('*')

    if (tier) {
      const tierNum = parseInt(tier)
      if (tierNum >= 1 && tierNum <= 5) {
        query = query.eq('tier', tierNum)
      }
    }

    if (workflowState) {
      query = query.eq('workflow_state', workflowState)
    }

    if (fromDate) {
      query = query.gte('recognition_date', fromDate)
    }

    if (toDate) {
      query = query.lte('recognition_date', toDate)
    }

    const { data: recognitions, error: recError } = await query.order('recognition_date', { ascending: false })

    if (recError) {
      console.error('Error fetching recognitions:', recError)
      return NextResponse.json(
        { error: recError.message },
        { status: 500 }
      )
    }

    // Для каждого recognition получаем images и annotations
    const exportData = await Promise.all(
      (recognitions || []).map(async (recognition) => {
        const { data: images } = await supabase
          .from('recognition_images')
          .select('*')
          .eq('recognition_id', recognition.recognition_id)

        const imagesWithAnnotations = await Promise.all(
          (images || []).map(async (image) => {
            const { data: annotations } = await supabase
              .from('annotations')
              .select('*')
              .eq('image_id', image.id)

            return { ...image, annotations: annotations || [] }
          })
        )

        // Опционально получаем историю
        let history = null
        if (includeHistory) {
          const { data: historyData } = await supabase
            .from('recognition_history')
            .select('*')
            .eq('recognition_id', recognition.recognition_id)
            .order('created_at', { ascending: true })
          
          history = historyData || []
        }

        return {
          recognition,
          images: imagesWithAnnotations,
          history
        }
      })
    )

    if (format === 'csv') {
      // Простой CSV export: одна строка = одна аннотация
      const csvRows: string[] = []
      
      // Header
      csvRows.push([
        'recognition_id',
        'recognition_date',
        'tier',
        'workflow_state',
        'photo_type',
        'annotation_id',
        'bbox_x1',
        'bbox_y1',
        'bbox_x2',
        'bbox_y2',
        'object_type',
        'object_subtype',
        'dish_index',
        'is_overlapped',
        'is_bottle_up',
        'is_error',
        'source'
      ].join(','))

      // Data rows
      exportData.forEach(item => {
        item.images.forEach(image => {
          image.annotations.forEach(annotation => {
            csvRows.push([
              item.recognition.recognition_id,
              item.recognition.recognition_date,
              item.recognition.tier,
              item.recognition.workflow_state,
              image.photo_type,
              annotation.id,
              annotation.bbox_x1,
              annotation.bbox_y1,
              annotation.bbox_x2,
              annotation.bbox_y2,
              annotation.object_type || '',
              annotation.object_subtype || '',
              annotation.dish_index ?? '',
              annotation.is_overlapped ?? '',
              annotation.is_bottle_up ?? '',
              annotation.is_error ?? '',
              annotation.source || ''
            ].join(','))
          })
        })
      })

      const csvContent = csvRows.join('\n')
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="annotations_export_${new Date().toISOString()}.csv"`
        }
      })
    } else {
      // JSON export
      return NextResponse.json({
        exported_at: new Date().toISOString(),
        filters: {
          tier,
          workflow_state: workflowState,
          from_date: fromDate,
          to_date: toDate,
          include_history: includeHistory
        },
        total_count: exportData.length,
        data: exportData
      })
    }
  } catch (error) {
    console.error('Unexpected error in export:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

