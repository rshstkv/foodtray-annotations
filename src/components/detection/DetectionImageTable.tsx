'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Download, Play } from 'lucide-react'
import { apiFetch } from '@/lib/api-response'
import type { DetectionImageSummary, DetectionTaskWithStats } from '@/types/detection'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface DetectionImageTableProps {
  task: DetectionTaskWithStats
  onBack: () => void
  onOpenImage: (imageId: number, allImageIds: number[]) => void
}

type StatusFilter = 'all' | 'pending' | 'done'

export function DetectionImageTable({ task, onBack, onOpenImage }: DetectionImageTableProps) {
  const [images, setImages] = useState<DetectionImageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadImages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const loadImages = async () => {
    setLoading(true)
    const res = await apiFetch<{ images: DetectionImageSummary[]; total: number }>(
      `/api/detection/tasks/${task.id}/images?summary=true`
    )
    if (res.success) {
      setImages(res.data.images)
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return images
    return images.filter((img) => img.status === statusFilter)
  }, [images, statusFilter])

  const stats = useMemo(() => {
    const total = images.length
    const done = images.filter((i) => i.status === 'done').length
    const modified = images.filter((i) => i.is_modified).length
    const pending = total - done
    return { total, done, modified, pending, percent: total > 0 ? Math.round((done / total) * 100) : 0 }
  }, [images])

  const allImageIds = useMemo(() => images.map((i) => i.id), [images])

  const handleExport = async () => {
    setExporting(true)
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
    setExporting(false)
  }

  const handleStartReview = () => {
    const firstPending = images.find((i) => i.status === 'pending')
    if (firstPending) {
      onOpenImage(firstPending.id, allImageIds)
    } else if (images.length > 0) {
      onOpenImage(images[0].id, allImageIds)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{task.bucket_name}</h2>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            <span>{stats.total} images</span>
            <span className="text-green-600 font-medium">{stats.done} done</span>
            <span>{stats.pending} pending</span>
            <span>{stats.modified} modified</span>
            <span className="font-semibold text-gray-700">{stats.percent}%</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          <Download className="w-4 h-4 mr-1" />
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
        <Button size="sm" onClick={handleStartReview} disabled={images.length === 0}>
          <Play className="w-4 h-4 mr-1" />
          {stats.pending > 0 ? 'Start Review' : 'Browse'}
        </Button>
      </div>

      <div className="mb-4 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{ width: `${stats.percent}%` }}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(['all', 'pending', 'done'] as const).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(f)}
          >
            {f === 'all' ? `All (${stats.total})` : f === 'pending' ? `Pending (${stats.pending})` : `Done (${stats.done})`}
          </Button>
        ))}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Filename</TableHead>
              <TableHead className="w-20 text-center">Food</TableHead>
              <TableHead className="w-20 text-center">Plate</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-24 text-center">Modified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                  No images match this filter
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((img, idx) => (
                <TableRow
                  key={img.id}
                  className="cursor-pointer"
                  onClick={() => onOpenImage(img.id, allImageIds)}
                >
                  <TableCell className="font-mono text-gray-400">{idx + 1}</TableCell>
                  <TableCell className="font-medium truncate max-w-[300px]">
                    {img.image_filename}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-blue-600 font-medium">{img.food_count}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-emerald-600 font-medium">{img.plate_count}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={img.status === 'done' ? 'default' : 'secondary'}
                      className={img.status === 'done' ? 'bg-green-500' : ''}
                    >
                      {img.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {img.is_modified && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        modified
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
