import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]/export
 * Export all image annotations for a task as downloadable JSON.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { data: task, error: taskError } = await supabase
      .from('detection_tasks')
      .select('*')
      .eq('id', parseInt(taskId))
      .single()

    if (taskError || !task) {
      return apiError('Task not found', 404)
    }

    const { data: images, error: imagesError } = await supabase
      .from('detection_image_tasks')
      .select('*')
      .eq('task_id', parseInt(taskId))
      .order('id', { ascending: true })

    if (imagesError) {
      return apiError(imagesError.message, 500)
    }

    const exportData = {
      bucket_name: task.bucket_name,
      exported_at: new Date().toISOString(),
      images: (images ?? []).map((img: Record<string, unknown>) => ({
        image: img.image_filename,
        original: img.original_annotations ?? [],
        edited: img.edited_annotations ?? img.original_annotations ?? [],
        is_modified: img.is_modified ?? false,
        reviewed: img.status === 'done',
      })),
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="detection_export_${task.bucket_name}_${timestamp}.json"`,
      },
    })
  } catch (err) {
    console.error('[detection/export] Error:', err)
    return apiError('Internal server error', 500)
  }
}
