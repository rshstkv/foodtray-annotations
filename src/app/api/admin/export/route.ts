import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type {
  ValidationExportData,
  ValidationExportRecognition,
  ValidationExportItem,
  ValidationExportImage,
  ValidationExportAnnotation,
  ExportRecipe,
  ExportRecipeLine,
  ValidationInfo,
  ValidationType,
  ActiveMenuItem,
} from '@/types/domain'

/**
 * GET /api/admin/export
 * 
 * Экспорт валидированных данных в JSON формате для data scientists
 * Query params:
 * - recognitionIds: comma-separated список recognition IDs (required)
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

    // Получение параметров
    const searchParams = request.nextUrl.searchParams
    const recognitionIdsParam = searchParams.get('recognitionIds')

    if (!recognitionIdsParam) {
      return NextResponse.json({ error: 'recognitionIds parameter is required' }, { status: 400 })
    }

    const recognitionIds = recognitionIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

    if (recognitionIds.length === 0) {
      return NextResponse.json({ error: 'No valid recognition IDs provided' }, { status: 400 })
    }

    // Получить recognitions
    const { data: recognitions, error: recognitionsError } = await supabase
      .from('recognitions')
      .select('id, batch_id')
      .in('id', recognitionIds)
      .order('id')

    if (recognitionsError) {
      console.error('[export] Error fetching recognitions:', recognitionsError)
      return NextResponse.json({ error: recognitionsError.message }, { status: 500 })
    }

    if (!recognitions || recognitions.length === 0) {
      return NextResponse.json({ error: 'No recognitions found' }, { status: 404 })
    }

    // Получить все completed work logs для этих recognitions
    const { data: workLogs, error: workLogsError } = await supabase
      .from('validation_work_log')
      .select('id, recognition_id, validation_type, completed_at, assigned_to')
      .in('recognition_id', recognitionIds)
      .eq('status', 'completed')
      .order('recognition_id')
      .order('completed_at', { ascending: false })

    if (workLogsError) {
      console.error('[export] Error fetching work logs:', workLogsError)
      return NextResponse.json({ error: workLogsError.message }, { status: 500 })
    }

    // Группировать work logs по recognition_id (берем последний для каждого типа валидации)
    const workLogsByRecognition = new Map<number, Map<string, any>>()
    
    for (const log of workLogs || []) {
      if (!workLogsByRecognition.has(log.recognition_id)) {
        workLogsByRecognition.set(log.recognition_id, new Map())
      }
      
      const recLogs = workLogsByRecognition.get(log.recognition_id)!
      // Берем только первую (последнюю по времени) для каждого типа
      if (!recLogs.has(log.validation_type)) {
        recLogs.set(log.validation_type, log)
      }
    }

    // Собрать все типы валидаций, которые есть в данных
    const allValidationTypes = new Set<ValidationType>()
    for (const logs of workLogsByRecognition.values()) {
      for (const type of logs.keys()) {
        allValidationTypes.add(type as ValidationType)
      }
    }

    // Получить work_log_ids для загрузки items и annotations
    const workLogIds = Array.from(workLogsByRecognition.values())
      .flatMap(logs => Array.from(logs.values()).map(log => log.id))

    // Загрузить work_items для всех work_logs
    const { data: workItems, error: workItemsError } = await supabase
      .from('work_items')
      .select('*')
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workItemsError) {
      console.error('[export] Error fetching work items:', workItemsError)
      return NextResponse.json({ error: workItemsError.message }, { status: 500 })
    }

    // Загрузить work_annotations для всех work_logs
    const { data: workAnnotations, error: workAnnotationsError } = await supabase
      .from('work_annotations')
      .select('*')
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workAnnotationsError) {
      console.error('[export] Error fetching work annotations:', workAnnotationsError)
      return NextResponse.json({ error: workAnnotationsError.message }, { status: 500 })
    }

    // Загрузить images для всех recognitions
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('*')
      .in('recognition_id', recognitionIds)
      .order('recognition_id')
      .order('camera_number')

    if (imagesError) {
      console.error('[export] Error fetching images:', imagesError)
      return NextResponse.json({ error: imagesError.message }, { status: 500 })
    }

    // Загрузить recipes для всех recognitions
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('*')
      .in('recognition_id', recognitionIds)

    if (recipesError) {
      console.error('[export] Error fetching recipes:', recipesError)
    }

    // Загрузить recipe lines
    const recipeIds = recipes?.map(r => r.id) || []
    const { data: recipeLines, error: recipeLinesError } = await supabase
      .from('recipe_lines')
      .select('*')
      .in('recipe_id', recipeIds)
      .order('recipe_id')
      .order('line_number')

    if (recipeLinesError) {
      console.error('[export] Error fetching recipe lines:', recipeLinesError)
    }

    // Загрузить recipe line options
    const recipeLineIds = recipeLines?.map(rl => rl.id) || []
    const { data: recipeLineOptions, error: recipeLineOptionsError } = await supabase
      .from('recipe_line_options')
      .select('*')
      .in('recipe_line_id', recipeLineIds.length > 0 ? recipeLineIds : [0])

    if (recipeLineOptionsError) {
      console.error('[export] Error fetching recipe line options:', recipeLineOptionsError)
    }

    // Загрузить active menu items
    const { data: activeMenuItems, error: activeMenuError } = await supabase
      .from('recognition_active_menu_items')
      .select('*')
      .in('recognition_id', recognitionIds)

    if (activeMenuError) {
      console.error('[export] Error fetching active menu:', activeMenuError)
    }

    // Создать maps для быстрого доступа
    const workItemsByWorkLog = new Map<number, any[]>()
    for (const item of workItems || []) {
      if (!workItemsByWorkLog.has(item.work_log_id)) {
        workItemsByWorkLog.set(item.work_log_id, [])
      }
      workItemsByWorkLog.get(item.work_log_id)!.push(item)
    }

    const workAnnotationsByWorkLog = new Map<number, any[]>()
    for (const ann of workAnnotations || []) {
      if (!workAnnotationsByWorkLog.has(ann.work_log_id)) {
        workAnnotationsByWorkLog.set(ann.work_log_id, [])
      }
      workAnnotationsByWorkLog.get(ann.work_log_id)!.push(ann)
    }

    const imagesByRecognition = new Map<number, any[]>()
    for (const img of images || []) {
      if (!imagesByRecognition.has(img.recognition_id)) {
        imagesByRecognition.set(img.recognition_id, [])
      }
      imagesByRecognition.get(img.recognition_id)!.push(img)
    }

    const recipesByRecognition = new Map<number, any>()
    for (const recipe of recipes || []) {
      recipesByRecognition.set(recipe.recognition_id, recipe)
    }

    const recipeLinesByRecipeId = new Map<number, any[]>()
    for (const line of recipeLines || []) {
      if (!recipeLinesByRecipeId.has(line.recipe_id)) {
        recipeLinesByRecipeId.set(line.recipe_id, [])
      }
      recipeLinesByRecipeId.get(line.recipe_id)!.push(line)
    }

    const recipeLineOptionsByLineId = new Map<number, any[]>()
    for (const option of recipeLineOptions || []) {
      if (!recipeLineOptionsByLineId.has(option.recipe_line_id)) {
        recipeLineOptionsByLineId.set(option.recipe_line_id, [])
      }
      recipeLineOptionsByLineId.get(option.recipe_line_id)!.push(option)
    }

    const activeMenuByRecognition = new Map<number, ActiveMenuItem[]>()
    for (const item of activeMenuItems || []) {
      if (!activeMenuByRecognition.has(item.recognition_id)) {
        activeMenuByRecognition.set(item.recognition_id, [])
      }
      activeMenuByRecognition.get(item.recognition_id)!.push({
        external_id: item.external_id,
        name: item.name,
        category: item.category,
        price: item.price,
      })
    }

    // Собрать данные для каждого recognition
    const exportRecognitions: ValidationExportRecognition[] = []

    for (const recognition of recognitions) {
      const recId = recognition.id
      const recWorkLogs = workLogsByRecognition.get(recId)

      if (!recWorkLogs || recWorkLogs.size === 0) {
        continue // Пропускаем recognitions без completed валидаций
      }

      // Получить последний work_log (любого типа, но берем самый поздний)
      const allLogs = Array.from(recWorkLogs.values())
      const latestLog = allLogs.reduce((latest, log) => {
        return new Date(log.completed_at) > new Date(latest.completed_at) ? log : latest
      }, allLogs[0])

      // Собрать items из последнего work_log
      const items = workItemsByWorkLog.get(latestLog.id) || []
      const exportItems: ValidationExportItem[] = items.map(item => ({
        id: item.id,
        type: item.type,
        quantity: item.quantity,
        recipe_line_id: item.recipe_line_id,
        bottle_orientation: item.bottle_orientation,
        metadata: item.metadata,
      }))

      // Собрать annotations из последнего work_log
      const annotations = workAnnotationsByWorkLog.get(latestLog.id) || []
      
      // Группировать annotations по image_id
      const annotationsByImageId = new Map<number, any[]>()
      for (const ann of annotations) {
        if (!annotationsByImageId.has(ann.image_id)) {
          annotationsByImageId.set(ann.image_id, [])
        }
        annotationsByImageId.get(ann.image_id)!.push(ann)
      }

      // Собрать images с annotations
      const recImages = imagesByRecognition.get(recId) || []
      const exportImages: ValidationExportImage[] = recImages.map(img => {
        const imgAnnotations = annotationsByImageId.get(img.id) || []
        
        return {
          id: img.id,
          camera_number: img.camera_number,
          image_name: img.camera_number === 1 ? 'Main' : 'Qualifying',
          storage_path: img.storage_path,
          width: img.width,
          height: img.height,
          annotations: imgAnnotations.map(ann => ({
            id: ann.id,
            item_id: ann.work_item_id,
            bbox: ann.bbox,
            is_occluded: ann.is_occluded,
            occlusion_metadata: ann.occlusion_metadata,
          })),
        }
      })

      // Собрать recipe
      let exportRecipe: ExportRecipe | null = null
      const recipe = recipesByRecognition.get(recId)
      
      if (recipe) {
        const lines = recipeLinesByRecipeId.get(recipe.id) || []
        const exportLines: ExportRecipeLine[] = lines.map(line => ({
          id: line.id,
          line_number: line.line_number,
          quantity: line.quantity,
          options: recipeLineOptionsByLineId.get(line.id) || [],
        }))

        exportRecipe = {
          id: recipe.id,
          total_amount: recipe.total_amount,
          lines: exportLines,
        }
      }

      // Собрать validation info
      const validationInfo: Record<string, ValidationInfo> = {}
      for (const [validationType, log] of recWorkLogs.entries()) {
        validationInfo[validationType] = {
          completed_at: log.completed_at,
          assigned_to: log.assigned_to,
          work_log_id: log.id,
        }
      }

      exportRecognitions.push({
        recognition_id: recId,
        batch_id: recognition.batch_id,
        items: exportItems,
        images: exportImages,
        recipe: exportRecipe,
        active_menu: activeMenuByRecognition.get(recId) || [],
        validation_info: validationInfo,
      })
    }

    // Формирование финального результата
    const exportData: ValidationExportData = {
      export_metadata: {
        exported_at: new Date().toISOString(),
        recognition_count: exportRecognitions.length,
        validation_types_included: Array.from(allValidationTypes),
      },
      recognitions: exportRecognitions,
    }

    // Возврат JSON с правильными заголовками
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="validation_export_${timestamp}.json"`,
      },
    })
  } catch (error) {
    console.error('[export] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
