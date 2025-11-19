import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/validation/[workLogId]/reset
 * 
 * Откатить work_items и work_annotations к начальному состоянию ТЕКУЩЕГО ЭТАПА
 * (не всего recognition, а только текущей валидации)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workLogId: string }> }
) {
  try {
    const { workLogId } = await params
    const workLogIdNum = parseInt(workLogId, 10)

    if (isNaN(workLogIdNum)) {
      return apiError('Invalid work log ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    console.log(`[validation/reset] Resetting work_log ${workLogIdNum} to initial state`)

    // 1. Получить work_log для проверки прав
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', workLogIdNum)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    if (workLog.assigned_to !== user.id) {
      return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
    }

    const recognitionId = workLog.recognition_id

    // 2. Удалить все work_items (каскадно удалятся work_annotations)
    await supabase
      .from('work_items')
      .delete()
      .eq('work_log_id', workLogIdNum)

    console.log(`[validation/reset] Deleted all work_items for work_log ${workLogIdNum}`)

    // 3. Скопировать заново из initial_tray_items
    // Используем ту же логику что и в триггере initialize_work_session
    const { data: initialItems } = await supabase
      .from('initial_tray_items')
      .select(`
        id,
        recognition_id,
        item_type,
        source,
        recipe_line_option_id,
        bottle_orientation,
        metadata
      `)
      .eq('recognition_id', recognitionId)

    if (!initialItems || initialItems.length === 0) {
      console.warn(`[validation/reset] No initial_tray_items found for recognition ${recognitionId}`)
      return apiSuccess({ items: [], annotations: [] })
    }

    // 4. Для каждого initial_item создаем work_item
    const workItemsToInsert = []
    for (const iti of initialItems) {
      // Получить recipe_line_id через recipe_line_options (если есть)
      let recipeLineId = null
      let quantity = 1

      if (iti.recipe_line_option_id) {
        const { data: rlo } = await supabase
          .from('recipe_line_options')
          .select('recipe_line_id, recipe_id')
          .eq('id', iti.recipe_line_option_id)
          .single()

        if (rlo) {
          recipeLineId = rlo.recipe_line_id

          // Получить quantity из recipe_lines
          const { data: rl } = await supabase
            .from('recipe_lines')
            .select('quantity')
            .eq('id', rlo.recipe_line_id)
            .single()

          if (rl) {
            quantity = rl.quantity
          }
        }
      }

      workItemsToInsert.push({
        work_log_id: workLogIdNum,
        initial_item_id: iti.id,
        recognition_id: iti.recognition_id,
        type: iti.item_type,
        source: iti.source,
        recipe_line_id: recipeLineId,
        quantity: quantity,
        bottle_orientation: iti.bottle_orientation,
        metadata: iti.metadata, // ВАЖНО: копируем metadata (там может быть name для блюд из меню)
      })
    }

    const { data: newWorkItems, error: insertError } = await supabase
      .from('work_items')
      .insert(workItemsToInsert)
      .select()

    if (insertError) {
      console.error('[validation/reset] Error inserting work_items:', insertError)
      return apiError('Failed to reset items', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    console.log(`[validation/reset] Created ${newWorkItems.length} work_items`)

    // 5. Получить image IDs для recognition
    const { data: images } = await supabase
      .from('images')
      .select('id')
      .eq('recognition_id', recognitionId)

    const imageIds = images?.map(img => img.id) || []

    if (imageIds.length === 0) {
      console.warn(`[validation/reset] No images found for recognition ${recognitionId}`)
      return apiSuccess({ items: newWorkItems, annotations: [] })
    }

    // 6. Скопировать annotations из initial_annotations
    const { data: initialAnnotations } = await supabase
      .from('initial_annotations')
      .select('*')
      .in('image_id', imageIds)

    console.log(`[validation/reset] Found ${initialAnnotations?.length || 0} initial_annotations`)

    if (initialAnnotations && initialAnnotations.length > 0) {
      const annotationsToInsert = []
      
      for (const ia of initialAnnotations) {
        // Найти соответствующий work_item
        const workItem = newWorkItems.find(wi => wi.initial_item_id === ia.initial_tray_item_id)
        
        if (workItem) {
          annotationsToInsert.push({
            work_log_id: workLogIdNum,
            initial_annotation_id: ia.id,
            image_id: ia.image_id,
            work_item_id: workItem.id,
            bbox: ia.bbox,
            is_occluded: ia.is_occluded,
            occlusion_metadata: null,
          })
        }
      }

      if (annotationsToInsert.length > 0) {
        const { error: annError } = await supabase
          .from('work_annotations')
          .insert(annotationsToInsert)

        if (annError) {
          console.error('[validation/reset] Error inserting work_annotations:', annError)
        } else {
          console.log(`[validation/reset] Created ${annotationsToInsert.length} work_annotations`)
        }
      }
    }

    // 7. Загрузить обновленные данные для возврата
    const { data: finalItems } = await supabase
      .from('work_items')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    const { data: finalAnnotations } = await supabase
      .from('work_annotations')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    console.log(`[validation/reset] ✓ Reset complete:`)
    console.log(`  - Items: ${finalItems?.length || 0}`)
    console.log(`  - Annotations: ${finalAnnotations?.length || 0}`)
    console.log(`  - Initial items had: ${initialItems.length}`)
    console.log(`  - Initial annotations had: ${initialAnnotations?.length || 0}`)

    return apiSuccess({
      items: finalItems || [],
      annotations: finalAnnotations || [],
    })
  } catch (error) {
    console.error('[validation/reset] Unexpected error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
