import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]/images
 * List images for a detection task. Supports pagination and status filter.
 * Query params: page, pageSize, status (pending|done|all)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')))
    const statusFilter = searchParams.get('status') || 'all'

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('detection_image_tasks')
      .select('*', { count: 'exact' })
      .eq('task_id', parseInt(taskId))
      .order('id', { ascending: true })
      .range(from, to)

    if (statusFilter === 'pending' || statusFilter === 'done') {
      query = query.eq('status', statusFilter)
    }

    const { data: images, error, count } = await query

    if (error) {
      return apiError(error.message, 500)
    }

    return apiSuccess({
      images: images ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    })
  } catch (err) {
    console.error('[detection/tasks/[taskId]/images] Error:', err)
    return apiError('Internal server error', 500)
  }
}
