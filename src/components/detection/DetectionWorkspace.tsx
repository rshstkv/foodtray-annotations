'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BBoxCanvas } from '@/components/validation/BBoxCanvas'
import { DetectionTopBar } from './DetectionTopBar'
import { DetectionObjectSidebar } from './DetectionObjectSidebar'
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
const MAX_UNDO = 50

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

function cloneAnnotations(anns: AnnotationWithId[]): AnnotationWithId[] {
  return anns.map((a) => ({ ...a }))
}

interface DetectionWorkspaceProps {
  task: DetectionTaskWithStats
  initialImageId: number
  allImageIds: number[]
  onBack: () => void
}

export function DetectionWorkspace({
  task,
  initialImageId,
  allImageIds,
  onBack,
}: DetectionWorkspaceProps) {
  const [currentImageId, setCurrentImageId] = useState(initialImageId)
  const [currentImage, setCurrentImage] = useState<DetectionImageTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [annotations, setAnnotations] = useState<AnnotationWithId[]>([])
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingClass, setDrawingClass] = useState<DetectionClassId>(0)

  const savingRef = useRef(false)
  const undoStackRef = useRef<AnnotationWithId[][]>([])
  const redoStackRef = useRef<AnnotationWithId[][]>([])

  const currentGlobalIndex = allImageIds.indexOf(currentImageId)

  // --- Undo / Redo ---
  const pushUndo = useCallback((current: AnnotationWithId[]) => {
    undoStackRef.current.push(cloneAnnotations(current))
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
    redoStackRef.current = []
  }, [])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current.push(cloneAnnotations(annotations))
    const prev = undoStackRef.current.pop()!
    setAnnotations(prev)
    setHasUnsavedChanges(true)
    setSelectedAnnotationId(null)
  }, [annotations])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current.push(cloneAnnotations(annotations))
    const next = redoStackRef.current.pop()!
    setAnnotations(next)
    setHasUnsavedChanges(true)
    setSelectedAnnotationId(null)
  }, [annotations])

  // --- Load image ---
  const loadImage = useCallback(async (imageId: number) => {
    setLoading(true)
    const res = await apiFetch<DetectionImageTask>(
      `/api/detection/tasks/${task.id}/images/${imageId}`
    )
    if (res.success) {
      setCurrentImage(res.data)
      const source = res.data.edited_annotations ?? res.data.original_annotations ?? []
      _nextUid = 1
      setAnnotations(source.map((a: YoloAnnotation) => ({ ...a, _uid: _nextUid++ })))
      setHasUnsavedChanges(false)
      setSelectedAnnotationId(null)
      setIsDrawing(false)
      undoStackRef.current = []
      redoStackRef.current = []
    }
    setLoading(false)
  }, [task.id])

  useEffect(() => {
    loadImage(currentImageId)
  }, [currentImageId, loadImage])

  // --- Save ---
  const saveAnnotations = useCallback(
    async (opts?: { markDone?: boolean }) => {
      if (!currentImage || savingRef.current) return
      savingRef.current = true
      setSaving(true)

      const editedYolo: YoloAnnotation[] = annotations.map((a) => ({
        class: a.class,
        x_center: a.x_center,
        y_center: a.y_center,
        width: a.width,
        height: a.height,
      }))
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
        setCurrentImage(res.data)
        setHasUnsavedChanges(false)
      }
      setSaving(false)
      savingRef.current = false
    },
    [currentImage, annotations, task.id]
  )

  // --- Navigation ---
  const navigateTo = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= allImageIds.length) return
      const targetId = allImageIds[idx]
      if (targetId === currentImageId) return
      if (hasUnsavedChanges && currentImage) {
        await saveAnnotations()
      }
      setCurrentImageId(targetId)
    },
    [allImageIds, currentImageId, hasUnsavedChanges, currentImage, saveAnnotations]
  )

  const handleDoneAndNext = useCallback(async () => {
    await saveAnnotations({ markDone: true })
    if (currentGlobalIndex < allImageIds.length - 1) {
      setCurrentImageId(allImageIds[currentGlobalIndex + 1])
    }
  }, [saveAnnotations, currentGlobalIndex, allImageIds])

  // --- Annotation mutations (with undo) ---
  const handleAnnotationCreate = useCallback(
    (bbox: BBox) => {
      if (!currentImage?.image_width || !currentImage?.image_height) return
      pushUndo(annotations)
      const cls = drawingClass
      const yolo = pixelBBoxToYolo(bbox, cls, currentImage.image_width, currentImage.image_height)
      const newAnn: AnnotationWithId = { ...yolo, _uid: _nextUid++ }
      setAnnotations((prev) => [...prev, newAnn])
      setSelectedAnnotationId(newAnn._uid)
      setHasUnsavedChanges(true)
      setIsDrawing(false)
    },
    [drawingClass, currentImage, annotations, pushUndo]
  )

  const handleAnnotationUpdate = useCallback(
    (id: number | string, data: { bbox: BBox }) => {
      if (!currentImage?.image_width || !currentImage?.image_height) return
      pushUndo(annotations)
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
    [currentImage, annotations, pushUndo]
  )

  const handleAnnotationDelete = useCallback(
    (id: number | string) => {
      pushUndo(annotations)
      setAnnotations((prev) => prev.filter((a) => a._uid !== id))
      setSelectedAnnotationId(null)
      setHasUnsavedChanges(true)
    },
    [annotations, pushUndo]
  )

  const handleStartDrawing = useCallback((cls: DetectionClassId) => {
    setDrawingClass(cls)
    setSelectedAnnotationId(null)
    setIsDrawing(true)
  }, [])

  // --- Cycle selection through ALL annotations ---
  const cycleSelection = useCallback(
    (direction: 1 | -1) => {
      if (annotations.length === 0) return
      const currentIdx = annotations.findIndex((a) => a._uid === selectedAnnotationId)
      let nextIdx: number
      if (currentIdx === -1) {
        nextIdx = direction === 1 ? 0 : annotations.length - 1
      } else {
        nextIdx = (currentIdx + direction + annotations.length) % annotations.length
      }
      setSelectedAnnotationId(annotations[nextIdx]._uid)
    },
    [annotations, selectedAnnotationId]
  )

  // --- Canvas annotations: show only selected, or all when none selected ---
  const bboxAnnotations = useMemo(() => {
    if (!currentImage?.image_width || !currentImage?.image_height) return []
    return annotations
      .filter((a) => selectedAnnotationId === null || a._uid === selectedAnnotationId)
      .map((a) => {
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
  }, [annotations, currentImage, selectedAnnotationId])

  // --- Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return
      if (document.querySelector('[role="dialog"]')) return

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        saveAnnotations()
        return
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          navigateTo(currentGlobalIndex + 1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigateTo(currentGlobalIndex - 1)
          break
        case 'Shift':
          e.preventDefault()
          cycleSelection(1)
          break
        case ' ':
          e.preventDefault()
          handleDoneAndNext()
          break
        case '1':
          e.preventDefault()
          handleStartDrawing(0)
          break
        case '2':
          e.preventDefault()
          handleStartDrawing(1)
          break
        case 'Escape':
          setIsDrawing(false)
          setSelectedAnnotationId(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentGlobalIndex, navigateTo, cycleSelection, handleDoneAndNext, handleStartDrawing, undo, redo, saveAnnotations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  if (!currentImage) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-500">
        <p className="text-lg mb-2">Image not found</p>
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          Back to table
        </button>
      </div>
    )
  }

  const imageUrl = getImageUrl(currentImage.storage_path)
  const classLabel = drawingClass === 0 ? 'food' : 'plate'

  return (
    <div className="flex flex-col h-screen">
      <DetectionTopBar
        taskName={task.bucket_name}
        imageFilename={currentImage.image_filename}
        currentIndex={currentGlobalIndex}
        totalImages={allImageIds.length}
        isDone={currentImage.status === 'done'}
        hasUnsavedChanges={hasUnsavedChanges}
        onBack={onBack}
        onPrev={() => navigateTo(currentGlobalIndex - 1)}
        onNext={() => navigateTo(currentGlobalIndex + 1)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-gray-900">
          {currentImage.image_width && currentImage.image_height && (
            <BBoxCanvas
              imageUrl={imageUrl}
              imageWidth={currentImage.image_width}
              imageHeight={currentImage.image_height}
              annotations={bboxAnnotations}
              selectedAnnotationId={selectedAnnotationId}
              highlightedItemId={HIGHLIGHTED_ITEM_ID}
              mode={isDrawing ? 'draw' : 'edit'}
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
          {isDrawing && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded shadow">
              Draw a {classLabel} box &mdash; click and drag &middot; <kbd>Esc</kbd> cancel
            </div>
          )}
        </div>

        <DetectionObjectSidebar
          annotations={annotations}
          selectedId={selectedAnnotationId}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectAnnotation={(id) => {
            setSelectedAnnotationId(id)
            setIsDrawing(false)
          }}
          onDeleteAnnotation={(id) => handleAnnotationDelete(id)}
          onAddFood={() => handleStartDrawing(0)}
          onAddPlate={() => handleStartDrawing(1)}
          onSave={() => saveAnnotations()}
          onDoneAndNext={handleDoneAndNext}
          saving={saving}
          isDrawing={isDrawing}
        />
      </div>
    </div>
  )
}
