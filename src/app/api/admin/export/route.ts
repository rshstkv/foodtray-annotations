import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type {
  ValidationExportData,
  ValidationExportRecognition,
  ValidationExportItem,
  ValidationExportImage,
  ValidationExportAnnotation,
  ValidationExportRecipe,
  BBox,
} from '@/types/domain'

/**
 * GET /api/admin/export
 * 
 * Экспорт валидированных данных в новом формате для data scientists
 * Query params (те же что и в export-preview):
 * - userIds: comma-separated список user IDs (optional)
 * - step_<TYPE>: статус этапа completed/skipped/any (optional)
 * - search: recognition_id для поиска (optional)
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

    // Получение параметров (те же что в export-preview)
    const searchParams = request.nextUrl.searchParams
    const userIdsParam = searchParams.get('userIds')
    const searchQuery = searchParams.get('search')
    
    const userIds = userIdsParam ? userIdsParam.split(',').map(id => id.trim()) : null
    const searchRecognitionId = searchQuery ? parseInt(searchQuery) : null
    const stepFood = searchParams.get('step_FOOD_VALIDATION')
    const stepPlate = searchParams.get('step_PLATE_VALIDATION')
    const stepBuzzer = searchParams.get('step_BUZZER_VALIDATION')
    const stepOcclusion = searchParams.get('step_OCCLUSION_VALIDATION')
    const stepBottle = searchParams.get('step_BOTTLE_ORIENTATION_VALIDATION')

    console.log('[export] ========================================')
    console.log('[export] Using optimized export function')
    console.log('[export] ========================================')

    // Получить user emails для фильтрации
    let userEmails: string[] | null = null
    if (userIds && userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('email')
        .in('id', userIds)
      
      userEmails = profilesData?.map(p => p.email) || null
    }

    // Вызов оптимизированной функции экспорта
    const rpcParams = {
      p_user_emails: userEmails,
      p_step_food: stepFood || null,
      p_step_plate: stepPlate || null,
      p_step_buzzer: stepBuzzer || null,
      p_step_occlusion: stepOcclusion || null,
      p_step_bottle: stepBottle || null,
    }

    const startTime = Date.now()
    const { data: exportData, error } = await supabase.rpc('get_export_data', rpcParams)
    const duration = Date.now() - startTime

    console.log(`[export] Export completed in ${duration}ms`)

    if (error) {
      console.error('[export] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!exportData || !exportData.recognitions) {
      console.log('[export] ⚠️  No data found')
      return NextResponse.json({ error: 'No data found with given filters' }, { status: 404 })
    }

    console.log('[export] ✅ Export complete:')
    console.log('[export]   Total recognitions:', exportData.recognitions.length)
    console.log('[export] ========================================')

    // Возврат JSON с правильными заголовками
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="annotations_export_${timestamp}.json"`,
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
