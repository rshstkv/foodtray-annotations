import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

export interface ProblemStats {
  unresolved_ambiguity: number
  food_annotation_mismatch: number
  plate_annotation_mismatch: number
  total_with_issues: number
}

/**
 * GET /api/validation/problem-stats
 * 
 * Получить статистику по задачам с проблемами
 * Подсчитывает количество recognitions с различными типами проблем
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Вызываем RPC функции для подсчета
    const [
      { data: unresolvedAmbiguityCount },
      { data: foodMismatchCount },
      { data: plateMismatchCount },
      { data: totalCount }
    ] = await Promise.all([
      supabase.rpc('count_unresolved_ambiguity'),
      supabase.rpc('count_food_annotation_mismatch'),
      supabase.rpc('count_plate_annotation_mismatch'),
      supabase.rpc('count_total_with_issues')
    ])

    const stats: ProblemStats = {
      unresolved_ambiguity: unresolvedAmbiguityCount || 0,
      food_annotation_mismatch: foodMismatchCount || 0,
      plate_annotation_mismatch: plateMismatchCount || 0,
      total_with_issues: totalCount || 0
    }

    return apiSuccess(stats)
  } catch (error) {
    console.error('[validation/problem-stats] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

