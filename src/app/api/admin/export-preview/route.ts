import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type {
  ExportPreviewData,
  ExportPreviewStats,
  ItemType,
  ValidationType,
} from '@/types/domain'

/**
 * GET /api/admin/export-preview
 * 
 * Предпросмотр экспорта с детальной статистикой
 * Query params:
 * - userIds: comma-separated список user IDs для фильтрации (optional)
 * - step_<TYPE>: статус этапа (completed/skipped/any) (optional)
 * - limit: максимальное кол-во recognitions для preview (default: 500)
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
    const userIdsParam = searchParams.get('userIds')
    const pageParam = searchParams.get('page')
    const pageSizeParam = searchParams.get('pageSize')
    const searchQuery = searchParams.get('search')
    
    const userIds = userIdsParam ? userIdsParam.split(',').map(id => id.trim()) : null
    const page = pageParam ? parseInt(pageParam) : 1
    const pageSize = pageSizeParam ? parseInt(pageSizeParam) : 50

    console.log('[export-preview] User filter:', userIds)
    console.log('[export-preview] Page:', page, 'PageSize:', pageSize)
    console.log('[export-preview] Search:', searchQuery)

    // Подготовить параметры для RPC функций
    const searchRecognitionId = searchQuery ? parseInt(searchQuery) : null
    const stepFood = searchParams.get('step_FOOD_VALIDATION')
    const stepPlate = searchParams.get('step_PLATE_VALIDATION')
    const stepBuzzer = searchParams.get('step_BUZZER_VALIDATION')
    const stepOcclusion = searchParams.get('step_OCCLUSION_VALIDATION')
    const stepBottle = searchParams.get('step_BOTTLE_ORIENTATION_VALIDATION')

    const rpcParams = {
      user_ids: userIds || null,
      search_recognition_id: searchRecognitionId && !isNaN(searchRecognitionId) ? searchRecognitionId : null,
      step_food: stepFood || null,
      step_plate: stepPlate || null,
      step_buzzer: stepBuzzer || null,
      step_occlusion: stepOcclusion || null,
      step_bottle: stepBottle || null,
    }

    // 1. Получить общее количество (для пагинации)
    const { data: totalCount, error: countError } = await supabase.rpc('get_filtered_work_logs_count', rpcParams)

    if (countError) {
      console.error('[export-preview] Error getting count:', countError)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    const totalRecognitions = totalCount || 0
    console.log('[export-preview] Total recognitions after filtering:', totalRecognitions)

    // 2. Получить данные для текущей страницы с пагинацией
    const pageOffset = (page - 1) * pageSize
    const { data: workLogs, error: workLogsError } = await supabase.rpc('get_filtered_work_logs', {
      ...rpcParams,
      page_limit: pageSize,
      page_offset: pageOffset,
    })

    if (workLogsError) {
      console.error('[export-preview] Error calling RPC:', workLogsError)
      return NextResponse.json({ error: workLogsError.message }, { status: 500 })
    }

    console.log('[export-preview] RPC returned:', workLogs?.length || 0, 'work logs for page', page)

    // Создать Map для быстрого доступа
    const latestWorkLogByRecognition = new Map<number, any>()
    for (const log of workLogs || []) {
      latestWorkLogByRecognition.set(log.recognition_id, {
        id: log.work_log_id,
        recognition_id: log.recognition_id,
        validation_steps: log.validation_steps,
        assigned_to: log.assigned_to,
        completed_at: log.completed_at,
      })
    }

    const paginatedRecognitionIds = Array.from(latestWorkLogByRecognition.keys())
    const workLogIds = paginatedRecognitionIds.map(recId => {
      const log = latestWorkLogByRecognition.get(recId)
      return log?.id
    }).filter(Boolean) as number[]

    console.log('[export-preview] Current page recognitions:', workLogIds.length)

    // Загрузить recognitions с batch_id для текущей страницы
    const { data: recognitions, error: recognitionsError } = await supabase
      .from('recognitions')
      .select('id, batch_id')
      .in('id', paginatedRecognitionIds)

    if (recognitionsError) {
      console.error('[export-preview] Error fetching recognitions:', recognitionsError)
      return NextResponse.json({ error: recognitionsError.message }, { status: 500 })
    }

    if (totalRecognitions === 0 || workLogIds.length === 0) {
      // Возвращаем пустой результат вместо ошибки
      const emptyStats: ExportPreviewStats = {
        total_recognitions: totalRecognitions,
        total_items: { FOOD: 0, PLATE: 0, BUZZER: 0, BOTTLE: 0, OTHER: 0 },
        total_annotations: 0,
        modified_annotations: 0,
        unmodified_annotations: 0,
        users_breakdown: [],
        validation_steps_breakdown: {
          FOOD_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
          PLATE_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
          BUZZER_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
          OCCLUSION_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
          BOTTLE_ORIENTATION_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
        },
      }
      
      const emptyData: ExportPreviewData = {
        stats: emptyStats,
        recognitions: [],
        pagination: {
          page,
          pageSize,
          totalPages: 0,
          totalItems: totalRecognitions,
        },
      }
      
      return NextResponse.json(emptyData, { status: 200 })
    }

    // Получить profiles для emails
    const userIdsInLogs = [...new Set(Array.from(latestWorkLogByRecognition.values()).map(log => log.assigned_to))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIdsInLogs)

    const userEmailMap = new Map(profiles?.map(p => [p.id, p.email]) || [])

    // Загрузить work_items
    const { data: workItems, error: workItemsError } = await supabase
      .from('work_items')
      .select('id, work_log_id, recognition_id, type')
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workItemsError) {
      console.error('[export-preview] Error fetching work items:', workItemsError)
      return NextResponse.json({ error: workItemsError.message }, { status: 500 })
    }

    // Загрузить work_annotations с initial_annotations для проверки изменений
    const { data: workAnnotations, error: workAnnotationsError } = await supabase
      .from('work_annotations')
      .select(`
        id,
        work_log_id,
        work_item_id,
        image_id,
        bbox,
        initial_annotation_id,
        initial_annotations(bbox)
      `)
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workAnnotationsError) {
      console.error('[export-preview] Error fetching work annotations:', workAnnotationsError)
      return NextResponse.json({ error: workAnnotationsError.message }, { status: 500 })
    }

    // Функция для сравнения bbox
    const bboxEquals = (bbox1: any, bbox2: any): boolean => {
      if (!bbox1 || !bbox2) return false
      return bbox1.x === bbox2.x && bbox1.y === bbox2.y && 
             bbox1.w === bbox2.w && bbox1.h === bbox2.h
    }

    // Подсчитать статистику
    const itemsByType: Record<ItemType, number> = {
      FOOD: 0,
      PLATE: 0,
      BUZZER: 0,
      BOTTLE: 0,
      OTHER: 0,
    }

    const itemsByRecognition = new Map<number, Record<ItemType, number>>()
    const annotationsByRecognition = new Map<number, { total: number; modified: number }>()
    
    for (const item of workItems || []) {
      itemsByType[item.type as ItemType]++
      
      if (!itemsByRecognition.has(item.recognition_id)) {
        itemsByRecognition.set(item.recognition_id, {
          FOOD: 0,
          PLATE: 0,
          BUZZER: 0,
          BOTTLE: 0,
          OTHER: 0,
        })
      }
      itemsByRecognition.get(item.recognition_id)![item.type as ItemType]++
    }

    let totalAnnotations = 0
    let modifiedAnnotations = 0

    for (const ann of workAnnotations || []) {
      totalAnnotations++
      
      const workLog = latestWorkLogByRecognition.get(
        (workItems || []).find(wi => wi.id === ann.work_item_id)?.recognition_id || 0
      )
      const recognitionId = workLog?.recognition_id
      
      if (recognitionId) {
        const initialAnnotation = Array.isArray(ann.initial_annotations) 
          ? ann.initial_annotations[0] 
          : ann.initial_annotations
        
        const wasModified = !bboxEquals(ann.bbox, initialAnnotation?.bbox)
        
        if (wasModified) {
          modifiedAnnotations++
        }
        
        if (!annotationsByRecognition.has(recognitionId)) {
          annotationsByRecognition.set(recognitionId, { total: 0, modified: 0 })
        }
        const stats = annotationsByRecognition.get(recognitionId)!
        stats.total++
        if (wasModified) stats.modified++
      }
    }

    // Users breakdown
    const usersBreakdown = Array.from(latestWorkLogByRecognition.values()).reduce((acc, log) => {
      const userId = log.assigned_to
      const email = userEmailMap.get(userId) || 'unknown'
      
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          email,
          recognitions_count: 0,
          items_count: 0,
          annotations_count: 0,
        }
      }
      
      acc[userId].recognitions_count++
      
      const items = (workItems || []).filter(wi => wi.work_log_id === log.id)
      acc[userId].items_count += items.length
      
      const annotations = (workAnnotations || []).filter(wa => wa.work_log_id === log.id)
      acc[userId].annotations_count += annotations.length
      
      return acc
    }, {} as Record<string, any>)

    // Validation steps breakdown
    const validationStepsBreakdown: Record<ValidationType, {completed: number; skipped: number; pending: number}> = {
      FOOD_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
      PLATE_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
      BUZZER_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
      OCCLUSION_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
      BOTTLE_ORIENTATION_VALIDATION: { completed: 0, skipped: 0, pending: 0 },
    }

    for (const log of Array.from(latestWorkLogByRecognition.values())) {
      if (log.validation_steps && Array.isArray(log.validation_steps)) {
        for (const step of log.validation_steps) {
          const type = step.type as ValidationType
          const status = step.status as 'completed' | 'skipped' | 'pending'
          if (validationStepsBreakdown[type]) {
            validationStepsBreakdown[type][status]++
          }
        }
      }
    }

    // Собрать данные по recognitions
    const recognitionsData = recognitions.map(rec => {
      const workLog = latestWorkLogByRecognition.get(rec.id)
      
      if (!workLog) {
        return null
      }

      const validationSteps = workLog.validation_steps && Array.isArray(workLog.validation_steps)
        ? workLog.validation_steps.map((step: any) => ({
            type: step.type as ValidationType,
            status: step.status as 'completed' | 'skipped' | 'pending',
            order: step.order,
          }))
        : []

      const assignedUsers = [{
        user_id: workLog.assigned_to,
        email: userEmailMap.get(workLog.assigned_to) || 'unknown',
      }]

      const annStats = annotationsByRecognition.get(rec.id) || { total: 0, modified: 0 }

      return {
        recognition_id: rec.id,
        batch_id: rec.batch_id,
        items_by_type: itemsByRecognition.get(rec.id) || {
          FOOD: 0,
          PLATE: 0,
          BUZZER: 0,
          BOTTLE: 0,
          OTHER: 0,
        },
        annotations_count: annStats.total,
        modified_annotations_count: annStats.modified,
        validation_steps: validationSteps,
        assigned_users: assignedUsers,
      }
    }).filter(Boolean)

    const stats: ExportPreviewStats = {
      total_recognitions: recognitions.length,
      total_items: itemsByType,
      total_annotations: totalAnnotations,
      modified_annotations: modifiedAnnotations,
      unmodified_annotations: totalAnnotations - modifiedAnnotations,
      users_breakdown: Object.values(usersBreakdown),
      validation_steps_breakdown: validationStepsBreakdown,
    }

    const previewData: ExportPreviewData = {
      stats,
      recognitions: recognitionsData as any,
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(totalRecognitions / pageSize),
        totalItems: totalRecognitions,
      },
    }

    return NextResponse.json(previewData, { status: 200 })
  } catch (error) {
    console.error('[export-preview] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

