import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import { mergeItems, mergeAnnotations } from '@/types/domain'

/**
 * GET /api/export/recognition/[id]?format=qwen
 * 
 * Экспорт финальной разметки recognition в формате Qwen
 * Возвращает финальное состояние (initial + current merged)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = parseInt(id, 10)

    if (isNaN(recognitionId)) {
      return apiError('Invalid recognition ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Загрузить recognition
    const { data: recognition, error: recognitionError } = await supabase
      .from('recognitions')
      .select('*')
      .eq('id', recognitionId)
      .single()

    if (recognitionError || !recognition) {
      return apiError('Recognition not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Загрузить images
    const { data: images } = await supabase
      .from('images')
      .select('*')
      .eq('recognition_id', recognitionId)
      .order('camera_number')

    if (!images || images.length === 0) {
      return apiError('No images found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Загрузить items (initial + current merged)
    const { data: initialItems } = await supabase
      .from('initial_tray_items')
      .select('*')
      .eq('recognition_id', recognitionId)

    const { data: currentItems } = await supabase
      .from('current_tray_items')
      .select('*')
      .eq('recognition_id', recognitionId)

    const mergedItems = mergeItems(initialItems || [], currentItems || [])

    // Загрузить annotations (initial + current merged)
    const imageIds = images.map((img) => img.id)
    const { data: initialAnnotations } = await supabase
      .from('initial_annotations')
      .select('*')
      .in('image_id', imageIds)

    const { data: currentAnnotations } = await supabase
      .from('annotations')
      .select('*')
      .in('image_id', imageIds)

    const mergedAnnotations = mergeAnnotations(
      initialAnnotations || [],
      currentAnnotations || [],
      images
    )

    // Форматировать в Qwen формат
    const exportData = {
      recognition_id: recognitionId,
      batch_id: recognition.batch_id,
      exported_at: new Date().toISOString(),
      images: images.map((image) => {
        const imageAnnotations = mergedAnnotations.filter(
          (ann) => ann.image_id === image.id && !ann.is_deleted
        )

        return {
          camera: image.camera_number,
          storage_path: image.storage_path,
          width: image.width,
          height: image.height,
          annotations: imageAnnotations.map((ann) => {
            const item = mergedItems.find((i) => i.id === ann.tray_item_id)
            
            return {
              bbox: ann.bbox,
              item_type: item?.item_type || 'OTHER',
              external_id: item?.menu_item_external_id || null,
              recipe_line_option_id: item?.recipe_line_option_id || null,
              is_occluded: ann.is_occluded,
              occlusion_metadata: ann.occlusion_metadata,
              source: ann.is_modified ? 'HUMAN' : 'MODEL',
            }
          }),
        }
      }),
      items: mergedItems.map((item) => ({
        id: item.id,
        item_type: item.item_type,
        external_id: item.menu_item_external_id,
        recipe_line_option_id: item.recipe_line_option_id,
        metadata: item.metadata,
        is_modified: item.is_modified,
      })),
      statistics: {
        total_items: mergedItems.length,
        total_annotations: mergedAnnotations.filter((a) => !a.is_deleted).length,
        occluded_annotations: mergedAnnotations.filter((a) => a.is_occluded && !a.is_deleted).length,
        human_modified: mergedAnnotations.filter((a) => a.is_modified && !a.is_deleted).length,
      },
    }

    return apiSuccess(exportData)
  } catch (error) {
    console.error('Export error:', error)
    return apiError(
      error instanceof Error ? error.message : 'Failed to export recognition',
      500,
      ApiErrorCode.INTERNAL_ERROR
    )
  }
}




