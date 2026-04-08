import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]/images
 *
 * ?summary=true  → lightweight list (no annotation payloads) for the table view
 * otherwise      → full rows, no pagination (editor loads all at once)
 *
 * Both modes support ?status=pending|done|all
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
    const statusFilter = searchParams.get('status') || 'all'
    const isSummary = searchParams.get('summary') === 'true'

    let query = supabase
      .from('detection_image_tasks')
      .select('*', { count: 'exact' })
      .eq('task_id', parseInt(taskId))
      .order('id', { ascending: true })

    if (statusFilter === 'pending' || statusFilter === 'done') {
      query = query.eq('status', statusFilter)
    }

    const { data: images, error, count } = await query

    if (error) {
      return apiError(error.message, 500)
    }

    if (isSummary) {
      const summaryRows = (images ?? []).map((img) => {
        const orig = (img.original_annotations ?? []) as Array<{ class: number }>
        const edited = img.edited_annotations as Array<{ class: number }> | null
        const anns = edited ?? orig
        return {
          id: img.id,
          task_id: img.task_id,
          image_filename: img.image_filename,
          status: img.status,
          is_modified: img.is_modified,
          food_count: anns.filter((a) => a.class === 0).length,
          plate_count: anns.filter((a) => a.class === 1).length,
        }
      })
      return apiSuccess({ images: summaryRows, total: count ?? 0 })
    }

    return apiSuccess({ images: images ?? [], total: count ?? 0 })
  } catch (err) {
    console.error('[detection/tasks/[taskId]/images] Error:', err)
    return apiError('Internal server error', 500)
  }
}
