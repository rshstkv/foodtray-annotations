import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationSession } from '@/types/domain'

/**
 * GET /api/validation/session/[workLogId]
 * 
 * Загрузить полную validation session для существующего work_log
 * Используется для обновления state без перезагрузки страницы
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workLogId: string }> }
) {
  try {
    const { workLogId } = await params
    const workLogIdNum = parseInt(workLogId, 10)

    if (isNaN(workLogIdNum)) {
      return apiError('Invalid work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Загрузить work_log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', workLogIdNum)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Проверка доступа
    if (workLog.assigned_to !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
      }
    }

    const recognitionId = workLog.recognition_id

    console.log(`[validation/session] Loading session: work_log=${workLogIdNum}, recognition=${recognitionId}, validation_type=${workLog.validation_type}`)

    // 2. Параллельно загрузить все данные
    const [
      { data: recognition },
      { data: images },
      { data: recipe },
      { data: activeMenu },
      { data: workItems },
      { data: workAnnotations },
    ] = await Promise.all([
      supabase.from('recognitions').select('*').eq('id', recognitionId).single(),
      supabase.from('images').select('*').eq('recognition_id', recognitionId).order('camera_number'),
      supabase.from('recipes').select('*').eq('recognition_id', recognitionId).single(),
      supabase.from('recognition_active_menu_items').select('*').eq('recognition_id', recognitionId),
      supabase.from('work_items').select('*').eq('work_log_id', workLogIdNum).eq('is_deleted', false),
      supabase.from('work_annotations').select('*').eq('work_log_id', workLogIdNum).eq('is_deleted', false),
    ])

    console.log(`[validation/session] Loaded: ${workItems?.length || 0} items, ${workAnnotations?.length || 0} annotations`)
    
    // DEBUG: Показать структуру первого work_item
    if (workItems && workItems.length > 0) {
      console.log(`[validation/session] First work_item structure:`, JSON.stringify(workItems[0], null, 2))
    }
    
    // Если items пустые, проверим initial_tray_items
    if (!workItems || workItems.length === 0) {
      const { data: initialItems } = await supabase
        .from('initial_tray_items')
        .select('count')
        .eq('recognition_id', recognitionId)
        
      console.log(`[validation/session] ⚠️ No work_items found! Initial tray items for recognition: ${initialItems?.[0]?.count || 0}`)
    }

    // 3. Загрузить recipe lines и options
    const recipeId = recipe?.id
    let recipeLines: any[] = []
    let recipeLineOptions: any[] = []

    if (recipeId) {
      const [linesResult, optionsResult] = await Promise.all([
        supabase.from('recipe_lines').select('*').eq('recipe_id', recipeId).order('line_number'),
        supabase.from('recipe_line_options').select('*').eq('recipe_id', recipeId)
      ])
      recipeLines = linesResult.data || []
      recipeLineOptions = optionsResult.data || []
      
      console.log(`[validation/session] Loaded recipe data: ${recipeLines.length} lines, ${recipeLineOptions.length} options`)
      
      // DEBUG: Показать структуру первой опции
      if (recipeLineOptions.length > 0) {
        console.log(`[validation/session] First recipe_line_option:`, JSON.stringify(recipeLineOptions[0], null, 2))
      }
      
      // DEBUG: Показать какие recipe_line_id есть у items и какие у options
      if (workItems && workItems.length > 0) {
        const itemRecipeLineIds = workItems.map(item => item.recipe_line_id).filter(Boolean)
        const optionRecipeLineIds = [...new Set(recipeLineOptions.map(opt => opt.recipe_line_id))]
        console.log(`[validation/session] work_items recipe_line_ids:`, itemRecipeLineIds)
        console.log(`[validation/session] unique recipe_line_ids in options:`, optionRecipeLineIds)
        
        // Проверим совпадения
        const matchingIds = itemRecipeLineIds.filter(id => optionRecipeLineIds.includes(id))
        const missingIds = itemRecipeLineIds.filter(id => !optionRecipeLineIds.includes(id))
        console.log(`[validation/session] ✓ Matching IDs:`, matchingIds)
        if (missingIds.length > 0) {
          console.warn(`[validation/session] ⚠️ Missing recipe_line_ids in options:`, missingIds)
        }
      }
    } else {
      console.warn(`[validation/session] No recipe found for recognition ${recognitionId}`)
    }

    // 4. Построить ValidationSession
    const session: ValidationSession = {
      workLog: workLog,
      recognition: recognition!,
      images: images || [],
      recipe: recipe || null,
      recipeLines,
      recipeLineOptions,
      activeMenu: activeMenu || [],
      items: (workItems || []).map(item => ({
        ...item,
        is_modified: true,
      })),
      annotations: (workAnnotations || []).map(ann => ({
        ...ann,
        is_modified: true,
        is_temp: false,
      })),
    }

    console.log(`[validation/session] Loaded session for work_log=${workLogIdNum}, recognition=${recognitionId}`)

    return apiSuccess({ session })
  } catch (error) {
    console.error('[validation/session] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

