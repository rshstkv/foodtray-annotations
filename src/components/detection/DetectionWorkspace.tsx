'use client'

import { useCallback, useEffect, useState } from 'react'
import { BBoxCanvas } from '@/components/validation/BBoxCanvas'
import { DetectionTopBar } from './DetectionTopBar'
import { DetectionImageNav } from './DetectionImageNav'
import { apiFetch } from '@/lib/api-response'
import { yoloToPixelBBox, pixelBBoxToYolo } from '@/lib/yolo-utils'
import {
  DETECTION_CLASS_COLORS,
  DETECTION_CLASSES,
  type DetectionClassId,
  type DetectionImageTask,
  type DetectionTaskWithStats,
  type YoloAnnotation,
} from '@/types/detection'
import type { BBox, ItemType } from '@/types/domain'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const HIGHLIGHTED_ITEM_ID = 1
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

function getImageUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/detection-images/${storagePath}`
}

function classIdToItemType(cls: DetectionClassId): ItemType {
  return cls === 0 ? 'FOOD' : 'PLATE'
}

interface AnnotationWithId extends YoloAnnotation {
  _uid: number
}

let _nextUid = 1

interface DetectionWorkspaceProps {
  task: DetectionTaskWithStats
  onBack: () => void
}

export function DetectionWorkspace({ task, onBack }: DetectionWorkspaceProps) {
  const [images, setImages] = useState<DetectionImageTask[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all')

  const [activeClass, setActiveClass] = useState<DetectionClassId>(0)
  const [annotations, setAnnotations] = useState<AnnotationWithId[]>([])
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const currentImage = images[currentIndex] ?? null

  // Load image list
  useEffect(() => {
    loadImages()
  }, [task.id, statusFilter])

  const loadImages = async () => {
    setLoading(true)
    const res = await apiFetch<{ images: DetectionImageTask[]; pagination: unknown }>(
      `/api/detection/tasks/${task.id}/images?pageSize=100&status=${statusFilter}`
    )
    if (res.success) {
      setImages(res.data.images)
      setCurrentIndex(0)
    }
    setLoading(false)
  }

  // When current image changes, load its annotations
  useEffect(() => {
    if (!currentImage) {
      setAnnotations([])
      return
    }
    const source = currentImage.edited_annotations ?? currentImage.original_annotations ?? []
    _nextUid = 1
    setAnnotations(
      source.map((a: YoloAnnotation) => ({ ...a, _uid: _nextUid++ }))
    )
    setHasUnsavedChanges(false)
    setSelectedAnnotationId(null)
  }, [currentImage?.id])

  // Save current annotations
  const saveAnnotations = useCallback(
    async (opts?: { markDone?: boolean }) => {
      if (!currentImage) return
      setSaving(true)

      const editedYolo: YoloAnnotation[] = annotations.map(({ _uid, ...rest }) => rest)
      const isModified =
        JSON.stringify(editedYolo) !== JSON.stringify(currentImage.original_annotations)

      const body: Record<string, unknown> = {
        edited_annotations: editedYolo,
        is_modified: isModified,
      }
      if (opts?.markDone !== undefined) {
        body.status = opts.markDone ? 'done' : 'pending'
      }

      const res = await apiFetch<DetectionImageTask>(
        `/api/detection/tasks/${task.id}/images/${currentImage.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )

      if (res.success) {
        setImages((prev) =>
          prev.map((img) => (img.id === currentImage.id ? res.data : img))
        )
        setHasUnsavedChanges(false)
      }
      setSaving(false)
    },
    [currentImage, annotations, task.id]
  )

  // Navigate to image
  const navigateTo = useCallback(
    async (index: number) => {
      if (index === currentIndex) return
      if (hasUnsavedChanges && currentImage) {
        await saveAnnotations()
      }
      setCurrentIndex(index)
    },
    [currentIndex, hasUnsavedChanges, currentImage, saveAnnotations]
  )

  // Toggle done status
  const toggleDone = useCallback(async () => {
    if (!currentImage) return
    const newStatus = currentImage.status === 'done' ? 'pending' : 'done'
    await saveAnnotations({ markDone: newStatus === 'done' })
  }, [currentImage, saveAnnotations])

  // Export
  const handleExport = useCallback(async () => {
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
  }, [task.id, task.bucket_name])

  // BBoxCanvas callbacks
  const handleAnnotationCreate = useCallback(
    (bbox: BBox) => {
      if (!currentImage?.image_width || !currentImage?.image_height) return
      const yolo = pixelBBoxToYolo(bbox, activeClass, currentImage.image_width, currentImage.image_height)
      const newAnn: AnnotationWithId = { ...yolo, _uid: _nextUid++ }
      setAnnotations((prev) => [...prev, newAnn])
      setHasUnsavedChanges(true)
    },
    [activeClass, currentImage]
  )

  const handleAnnotationUpdate = useCallback(
    (id: number | string, data: { bbox: BBox }) => {
      if (!currentImage?.image_width || !currentImage?.image_height) return
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a._uid !== id) return a
          const updated = pixelBBoxToYolo(
            data.bbox,
            a.class as DetectionClassId,
            currentImage.image_width!,
            currentImage.image_height!
          )
          return { ...updated, _uid: a._uid }
        })
      )
      setHasUnsavedChanges(true)
    },
    [currentImage]
  )

  const handleAnnotationDelete = useCallback(
    (id: number | string) => {
      setAnnotations((prev) => prev.filter((a) => a._uid !== id))
      setSelectedAnnotationId(null)
      setHasUnsavedChanges(true)
    },
    []
  )

  // Map annotations to BBoxData for canvas
  const bboxAnnotations = (() => {
    if (!currentImage?.image_width || !currentImage?.image_height) return []
    return annotations.map((a) => {
      const cls = a.class as DetectionClassId
      const pixelBBox = yoloToPixelBBox(a, currentImage.image_width!, currentImage.image_height!)
      return {
        id: a._uid,
        bbox: pixelBBox,
        itemType: classIdToItemType(cls),
        itemId: HIGHLIGHTED_ITEM_ID,
        itemLabel: DETECTION_CLASSES[cls] ?? `class ${cls}`,
        itemColor: DETECTION_CLASS_COLORS[cls] ?? '#999',
      }
    })
  })()

  // Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }
      if (document.querySelector('[role="dialog"]')) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentIndex < images.length - 1) navigateTo(currentIndex + 1)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentIndex > 0) navigateTo(currentIndex - 1)
        return
      }
      if (e.key === '1') {
        setActiveClass(0)
        return
      }
      if (e.key === '2') {
        setActiveClass(1)
        return
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        toggleDone()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, images.length, navigateTo, toggleDone])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-500">
        <p className="text-lg mb-2">No images found</p>
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          Back to tasks
        </button>
      </div>
    )
  }

  const imageUrl = currentImage ? getImageUrl(currentImage.storage_path) : ''

  return (
    <div className="flex flex-col h-screen">
      <DetectionTopBar
        activeClass={activeClass}
        onClassChange={setActiveClass}
        currentIndex={currentIndex}
        totalImages={images.length}
        isDone={currentImage?.status === 'done'}
        onToggleDone={toggleDone}
        onExport={handleExport}
        onBack={onBack}
        taskName={task.bucket_name}
      />
      <DetectionImageNav
        currentIndex={currentIndex}
        totalImages={images.length}
        onNavigate={navigateTo}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
      <div className="flex-1 relative bg-gray-900">
        {currentImage && currentImage.image_width && currentImage.image_height && (
          <BBoxCanvas
            imageUrl={imageUrl}
            imageWidth={currentImage.image_width}
            imageHeight={currentImage.image_height}
            annotations={bboxAnnotations}
            selectedAnnotationId={selectedAnnotationId}
            highlightedItemId={HIGHLIGHTED_ITEM_ID}
            mode="edit"
            canEdit
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationSelect={setSelectedAnnotationId}
            onAnnotationDelete={handleAnnotationDelete}
          />
        )}
        {saving && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
            Saving...
          </div>
        )}
      </div>
    </div>
  )
}
