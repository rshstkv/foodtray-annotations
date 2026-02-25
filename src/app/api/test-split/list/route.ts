import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/test-split/list?status=completed&has_flags=1&page=1&per_page=50
 * List all test split recognitions with work log status, reviewer, and flagged items
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const url = new URL(request.url)
    const statusFilter = url.searchParams.get('status') || ''
    const hasFlags = url.searchParams.get('has_flags') === '1'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const perPage = Math.min(100, Math.max(10, parseInt(url.searchParams.get('per_page') || '50', 10)))

    // Get all recognitions with their latest work log
    const query = supabase
      .from('test_split_recognitions')
      .select(`
        recognition_id,
        test_split_work_log (
          id,
          status,
          assigned_to,
          started_at,
          completed_at
        )
      `)
      .order('recognition_id', { ascending: true })

    const { data: recognitions, error } = await query

    if (error) {
      console.error('[test-split/list] Error:', error)
      return apiError('Failed to fetch list', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Get flagged items counts per recognition
    const { data: flaggedData } = await supabase
      .from('test_split_work_items')
      .select('recognition_id, flag_comment')
      .eq('flagged', true)
      .eq('is_deleted', false)

    const flagsByRecognition = new Map<number, { count: number; comments: string[] }>()
    for (const f of flaggedData || []) {
      const entry = flagsByRecognition.get(f.recognition_id) || { count: 0, comments: [] }
      entry.count++
      if (f.flag_comment) entry.comments.push(f.flag_comment)
      flagsByRecognition.set(f.recognition_id, entry)
    }

    // Get reviewer profiles
    const assignedIds = new Set<string>()
    for (const rec of recognitions || []) {
      const wl = (rec.test_split_work_log as any)?.[0] || (rec.test_split_work_log as any)
      if (wl?.assigned_to) assignedIds.add(wl.assigned_to)
    }

    const profileMap = new Map<string, string>()
    if (assignedIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', Array.from(assignedIds))

      for (const p of profiles || []) {
        profileMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8))
      }
    }

    // Build results
    let results = (recognitions || []).map(rec => {
      const workLogs = Array.isArray(rec.test_split_work_log)
        ? rec.test_split_work_log
        : rec.test_split_work_log ? [rec.test_split_work_log] : []

      const latestWl = workLogs.sort((a: any, b: any) =>
        new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()
      )[0] as any | undefined

      const flags = flagsByRecognition.get(rec.recognition_id)

      return {
        recognition_id: rec.recognition_id,
        status: latestWl?.status || 'pending',
        work_log_id: latestWl?.id || null,
        reviewer: latestWl?.assigned_to ? profileMap.get(latestWl.assigned_to) || null : null,
        completed_at: latestWl?.completed_at || null,
        flagged_count: flags?.count || 0,
        flag_comments: flags?.comments || [],
      }
    })

    // Apply filters
    if (statusFilter) {
      results = results.filter(r => r.status === statusFilter)
    }
    if (hasFlags) {
      results = results.filter(r => r.flagged_count > 0)
    }

    const total = results.length
    const paginated = results.slice((page - 1) * perPage, page * perPage)

    return apiSuccess({
      items: paginated,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    })
  } catch (error) {
    console.error('[test-split/list] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
