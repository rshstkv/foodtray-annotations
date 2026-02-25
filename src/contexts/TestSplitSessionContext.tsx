'use client'

import { useState, useCallback, ReactNode, useMemo, useEffect, useRef } from 'react'
import type {
  ValidationSession,
  TrayItem,
  AnnotationView,
  CreateItemRequest,
  UpdateItemRequest,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
} from '@/types/domain'
import { apiFetch } from '@/lib/api-response'
import { validateSession, type SessionValidationResult } from '@/lib/validation-rules'
import { ValidationSessionContext, type ValidationSessionContextValue } from '@/contexts/ValidationSessionContext'

interface ChangesTracking {
  createdItems: Map<number, TrayItem>
  updatedItems: Map<number, UpdateItemRequest>
  deletedItems: Set<number>
  createdAnnotations: Map<number | string, AnnotationView>
  updatedAnnotations: Map<number | string, Partial<AnnotationView>>
  deletedAnnotations: Set<number | string>
}

interface TestSplitSessionProviderProps {
  children: ReactNode
  initialSession: ValidationSession
  readOnly?: boolean
}

/**
 * TestSplitSessionProvider provides the SAME ValidationSessionContext
 * but routes all API calls to /api/test-split/* endpoints.
 * 
 * This means all existing UI components (ImageGrid, ItemsList, BBoxCanvas, etc.)
 * work without any changes - they consume useValidationSession() as usual.
 */
export function TestSplitSessionProvider({
  children,
  initialSession,
  readOnly = false,
}: TestSplitSessionProviderProps) {
  const [session, setSession] = useState<ValidationSession>(initialSession)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [changesTracking, setChangesTracking] = useState<ChangesTracking>({
    createdItems: new Map(),
    updatedItems: new Map(),
    deletedItems: new Set(),
    createdAnnotations: new Map(),
    updatedAnnotations: new Map(),
    deletedAnnotations: new Set(),
  })

  const [tempIdCounter, setTempIdCounter] = useState(-1)

  const hasUnsavedChanges = useMemo(() => {
    return (
      changesTracking.createdItems.size > 0 ||
      changesTracking.updatedItems.size > 0 ||
      changesTracking.deletedItems.size > 0 ||
      changesTracking.createdAnnotations.size > 0 ||
      changesTracking.updatedAnnotations.size > 0 ||
      changesTracking.deletedAnnotations.size > 0
    )
  }, [changesTracking])

  // Abandon on page close
  useEffect(() => {
    if (readOnly) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    const handleUnload = () => {
      const blob = new Blob(
        [JSON.stringify({ work_log_id: session.workLog.id })],
        { type: 'application/json' }
      )
      navigator.sendBeacon('/api/test-split/abandon', blob)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
    }
  }, [readOnly, session.workLog.id, hasUnsavedChanges])

  // Auto-save: persist changes 2s after last edit
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (readOnly || !hasUnsavedChanges) return

    const timer = setTimeout(() => {
      saveAllChangesRef.current?.()
    }, 2000)

    return () => clearTimeout(timer)
  }, [readOnly, hasUnsavedChanges, changesTracking])

  // Validation status
  const validationStatus = useMemo((): SessionValidationResult => {
    return validateSession(
      session.items,
      session.annotations,
      session.images,
      session.recipeLines || [],
      session.workLog.validation_type,
      session.recipeLineOptions || []
    )
  }, [session.items, session.annotations, session.images, session.recipeLines, session.workLog.validation_type, session.recipeLineOptions])

  // Create item (local only until save)
  const createItem = useCallback(
    (data: Omit<CreateItemRequest, 'work_log_id' | 'recognition_id'>): number | null => {
      if (readOnly) return null

      const newId = tempIdCounter
      setTempIdCounter(prev => prev - 1)

      const newItem: TrayItem = {
        id: newId,
        work_log_id: session.workLog.id,
        initial_item_id: null,
        recognition_id: session.recognition.id,
        type: data.type,
        recipe_line_id: data.recipe_line_id || null,
        quantity: data.quantity || 1,
        bottle_orientation: data.bottle_orientation || null,
        metadata: data.metadata || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_modified: true,
      }

      setSession(prev => ({
        ...prev,
        items: [...prev.items, newItem],
      }))

      setChangesTracking(prev => {
        const newCreated = new Map(prev.createdItems)
        newCreated.set(newId, newItem)
        return { ...prev, createdItems: newCreated }
      })

      return newId
    },
    [readOnly, tempIdCounter, session.workLog.id, session.recognition.id]
  )

  // Update item (local only until save)
  const updateItem = useCallback((id: number, data: UpdateItemRequest) => {
    if (readOnly) return

    setSession(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, ...data } : i),
    }))

    setChangesTracking(prev => {
      if (prev.createdItems.has(id)) {
        const newCreated = new Map(prev.createdItems)
        const existing = newCreated.get(id)!
        newCreated.set(id, { ...existing, ...data } as TrayItem)
        return { ...prev, createdItems: newCreated }
      }
      const newUpdated = new Map(prev.updatedItems)
      const existing = newUpdated.get(id) || {}
      newUpdated.set(id, { ...existing, ...data })
      return { ...prev, updatedItems: newUpdated }
    })
  }, [readOnly])

  // Delete item (local only until save)
  const deleteItem = useCallback((id: number) => {
    if (readOnly) return

    setSession(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id),
      annotations: prev.annotations.filter(a => a.work_item_id !== id),
    }))

    setChangesTracking(prev => {
      if (prev.createdItems.has(id)) {
        const newCreated = new Map(prev.createdItems)
        newCreated.delete(id)
        return { ...prev, createdItems: newCreated }
      }
      const newDeleted = new Set(prev.deletedItems)
      newDeleted.add(id)
      const newUpdated = new Map(prev.updatedItems)
      newUpdated.delete(id)
      return { ...prev, deletedItems: newDeleted, updatedItems: newUpdated }
    })
  }, [readOnly])

  // Create annotation
  const createAnnotation = useCallback(
    (data: Omit<CreateAnnotationRequest, 'work_log_id'> & { image_id: number }): number | string | null => {
      if (readOnly) return null

      const newId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`

      const newAnnotation: AnnotationView = {
        id: newId as any,
        work_log_id: session.workLog.id,
        initial_annotation_id: null,
        image_id: data.image_id,
        work_item_id: data.work_item_id,
        bbox: data.bbox,
        is_deleted: false,
        is_occluded: data.is_occluded || false,
        occlusion_metadata: data.occlusion_metadata || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_modified: true,
        is_temp: true,
      }

      setSession(prev => ({
        ...prev,
        annotations: [...prev.annotations, newAnnotation],
      }))

      setChangesTracking(prev => {
        const newCreated = new Map(prev.createdAnnotations)
        newCreated.set(newId, newAnnotation)
        return { ...prev, createdAnnotations: newCreated }
      })

      return newId
    },
    [readOnly, session.workLog.id]
  )

  // Update annotation
  const updateAnnotation = useCallback((id: number | string, data: UpdateAnnotationRequest) => {
    if (readOnly) return

    setSession(prev => ({
      ...prev,
      annotations: prev.annotations.map(a => a.id === id ? { ...a, ...data } : a),
    }))

    setChangesTracking(prev => {
      if (prev.createdAnnotations.has(id)) {
        const newCreated = new Map(prev.createdAnnotations)
        const existing = newCreated.get(id)!
        newCreated.set(id, { ...existing, ...data } as AnnotationView)
        return { ...prev, createdAnnotations: newCreated }
      }
      const newUpdated = new Map(prev.updatedAnnotations)
      const existing = newUpdated.get(id) || {}
      newUpdated.set(id, { ...existing, ...data })
      return { ...prev, updatedAnnotations: newUpdated }
    })
  }, [readOnly])

  // Delete annotation
  const deleteAnnotation = useCallback((id: number | string) => {
    if (readOnly) return

    setSession(prev => ({
      ...prev,
      annotations: prev.annotations.filter(a => a.id !== id),
    }))

    setChangesTracking(prev => {
      if (prev.createdAnnotations.has(id)) {
        const newCreated = new Map(prev.createdAnnotations)
        newCreated.delete(id)
        return { ...prev, createdAnnotations: newCreated }
      }
      const newDeleted = new Set(prev.deletedAnnotations)
      newDeleted.add(id)
      const newUpdated = new Map(prev.updatedAnnotations)
      newUpdated.delete(id)
      return { ...prev, deletedAnnotations: newDeleted, updatedAnnotations: newUpdated }
    })
  }, [readOnly])

  // Save all changes via test-split API
  const saveAllChanges = useCallback(async () => {
    if (readOnly || !hasUnsavedChanges || isSaving) return

    try {
      setIsSaving(true)
      setLoading(true)
      setError(null)

      const itemIdMapping = new Map<number, number>()

      // 1. Create new items
      for (const [tempId, item] of changesTracking.createdItems) {
        const response = await apiFetch('/api/test-split/items/create', {
          method: 'POST',
          body: JSON.stringify({
            work_log_id: session.workLog.id,
            recognition_id: session.recognition.id,
            type: item.type,
            quantity: item.quantity,
            metadata: item.metadata,
            bottle_orientation: item.bottle_orientation,
          }),
        })

        if (response.success && response.data) {
          const realId = (response.data as any).item.id
          itemIdMapping.set(tempId, realId)
          setSession(prev => ({
            ...prev,
            items: prev.items.map(i => i.id === tempId ? { ...i, id: realId } : i),
            annotations: prev.annotations.map(a => a.work_item_id === tempId ? { ...a, work_item_id: realId } : a),
          }))
        }
      }

      // 2. Update existing items
      for (const [id, changes] of changesTracking.updatedItems) {
        await apiFetch(`/api/test-split/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        })
      }

      // 3. Delete items
      for (const id of changesTracking.deletedItems) {
        await apiFetch(`/api/test-split/items/${id}`, { method: 'DELETE' })
      }

      // 4. Create new annotations
      for (const [tempId, ann] of changesTracking.createdAnnotations) {
        const actualWorkItemId = itemIdMapping.get(ann.work_item_id) || ann.work_item_id

        const response = await apiFetch('/api/test-split/annotations/create', {
          method: 'POST',
          body: JSON.stringify({
            work_log_id: session.workLog.id,
            image_id: ann.image_id,
            work_item_id: actualWorkItemId,
            bbox: ann.bbox,
            is_occluded: ann.is_occluded,
          }),
        })

        if (response.success && response.data) {
          const realId = (response.data as any).annotation.id
          setSession(prev => ({
            ...prev,
            annotations: prev.annotations.map(a => a.id === tempId ? { ...a, id: realId, is_temp: false } : a),
          }))
        }
      }

      // 5. Update existing annotations
      for (const [id, changes] of changesTracking.updatedAnnotations) {
        await apiFetch(`/api/test-split/annotations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        })
      }

      // 6. Delete annotations
      for (const id of changesTracking.deletedAnnotations) {
        await apiFetch(`/api/test-split/annotations/${id}`, { method: 'DELETE' })
      }

      // Clear tracking
      setChangesTracking({
        createdItems: new Map(),
        updatedItems: new Map(),
        deletedItems: new Set(),
        createdAnnotations: new Map(),
        updatedAnnotations: new Map(),
        deletedAnnotations: new Set(),
      })
    } catch (err) {
      setError('Failed to save changes')
      console.error(err)
      throw err
    } finally {
      setIsSaving(false)
      setLoading(false)
    }
  }, [hasUnsavedChanges, changesTracking, session.workLog.id, session.recognition.id, readOnly, isSaving])

  // Keep ref in sync for auto-save timer
  useEffect(() => {
    saveAllChangesRef.current = saveAllChanges
  }, [saveAllChanges])

  // Reset to initial state
  const resetToInitial = useCallback(async () => {
    if (readOnly) return

    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch(`/api/test-split/session/${session.workLog.id}`)

      if (response.success && response.data) {
        const reloaded = (response.data as any).session
        setSession(reloaded)
        setChangesTracking({
          createdItems: new Map(),
          updatedItems: new Map(),
          deletedItems: new Set(),
          createdAnnotations: new Map(),
          updatedAnnotations: new Map(),
          deletedAnnotations: new Set(),
        })
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
      }
    } catch (err) {
      setError('Failed to reset')
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id, readOnly])

  // Complete validation
  const completeValidation = useCallback(async () => {
    if (readOnly) return

    try {
      setLoading(true)
      setError(null)

      if (hasUnsavedChanges) {
        await saveAllChanges()
      }

      await apiFetch('/api/test-split/complete', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session.workLog.id }),
      })
    } catch (err) {
      setError('Failed to complete validation')
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id, readOnly, hasUnsavedChanges, saveAllChanges])

  // Abandon validation
  const abandonValidation = useCallback(async () => {
    if (readOnly) return

    try {
      setLoading(true)
      setError(null)

      await apiFetch('/api/test-split/abandon', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session.workLog.id }),
      })
    } catch (err) {
      setError('Failed to abandon validation')
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id, readOnly])

  // Finish step (single step for test split)
  const finishStep = useCallback(async (markAs: 'completed' | 'skipped') => {
    if (markAs === 'completed') {
      await completeValidation()
    }
  }, [completeValidation])

  // Complete current step
  const completeCurrentStep = useCallback(async (_stepIndex: number) => {
    await completeValidation()
  }, [completeValidation])

  const value: ValidationSessionContextValue = {
    session,
    loading,
    error,
    readOnly,
    items: session.items,
    selectedItemId,
    setSelectedItemId,
    createItem,
    updateItem,
    deleteItem,
    annotations: session.annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    hasUnsavedChanges,
    saveAllChanges,
    resetToInitial,
    validationStatus,
    completeValidation,
    abandonValidation,
    finishStep,
    completeCurrentStep,
  }

  return (
    <ValidationSessionContext.Provider value={value}>
      {children}
    </ValidationSessionContext.Provider>
  )
}
