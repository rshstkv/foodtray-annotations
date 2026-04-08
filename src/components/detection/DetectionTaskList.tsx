'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import { apiFetch } from '@/lib/api-response'
import type { DetectionTaskWithStats } from '@/types/detection'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface DetectionTaskListProps {
  onSelectTask: (task: DetectionTaskWithStats) => void
}

export function DetectionTaskList({ onSelectTask }: DetectionTaskListProps) {
  const [tasks, setTasks] = useState<DetectionTaskWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingTaskId, setExportingTaskId] = useState<number | null>(null)

  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    const res = await apiFetch<DetectionTaskWithStats[]>('/api/detection/tasks')
    if (res.success) {
      setTasks(res.data)
    }
    setLoading(false)
  }

  const handleExport = useCallback(async (e: React.MouseEvent, task: DetectionTaskWithStats) => {
    e.stopPropagation()
    setExportingTaskId(task.id)
    const res = await fetch(`/api/detection/tasks/${task.id}/export`)
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `detection_${task.bucket_name}_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExportingTaskId(null)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg font-medium mb-2">No detection tasks</p>
        <p className="text-sm">Run the ingest script to load a dataset:</p>
        <code className="text-xs bg-gray-100 px-3 py-1 rounded mt-2 inline-block">
          npm run detection:load -- --source /path/to/folder --bucket-name my_dataset
        </code>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Detection Tasks</h2>
      <div className="space-y-3">
        {tasks.map((task) => (
          <Card key={task.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{task.bucket_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    ID: {task.id}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{task.images_count} images</span>
                  <span>{task.done_count} done</span>
                  <span>{task.modified_count} modified</span>
                  <span className="font-medium text-gray-700">{task.percent_completed}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleExport(e, task)}
                  disabled={exportingTaskId === task.id}
                >
                  <Download className="w-4 h-4 mr-1" />
                  {exportingTaskId === task.id ? '...' : 'Export'}
                </Button>
                <Button onClick={() => onSelectTask(task)} size="sm">
                  Open
                </Button>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${task.percent_completed}%` }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
