'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type {
  ValidationSession,
  TrayItem,
  AnnotationView,
  CreateItemRequest,
  UpdateItemRequest,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  BBox,
} from '@/types/domain'
import { apiFetch } from '@/lib/api-response'

interface ValidationSessionContextValue {
  session: ValidationSession | null
  loading: boolean
  error: string | null

  // Items
  items: TrayItem[]
  selectedItemId: number | null
  setSelectedItemId: (id: number | null) => void
  createItem: (data: Omit<CreateItemRequest, 'recognition_id'>) => Promise<void>
  updateItem: (id: number, data: UpdateItemRequest) => Promise<void>
  deleteItem: (id: number) => Promise<void>

  // Annotations
  annotations: AnnotationView[]
  selectedAnnotationId: number | null
  setSelectedAnnotationId: (id: number | null) => void
  createAnnotation: (data: Omit<CreateAnnotationRequest, 'image_id'> & { image_id: number }) => Promise<void>
  updateAnnotation: (id: number, data: UpdateAnnotationRequest) => Promise<void>
  deleteAnnotation: (id: number) => Promise<void>

  // Session actions
  completeValidation: () => Promise<void>
  abandonValidation: () => Promise<void>
}

const ValidationSessionContext = createContext<ValidationSessionContextValue | null>(null)

export function useValidationSession() {
  const context = useContext(ValidationSessionContext)
  if (!context) {
    throw new Error('useValidationSession must be used within ValidationSessionProvider')
  }
  return context
}

interface ValidationSessionProviderProps {
  children: ReactNode
  initialSession: ValidationSession
}

export function ValidationSessionProvider({
  children,
  initialSession,
}: ValidationSessionProviderProps) {
  const [session, setSession] = useState<ValidationSession>(initialSession)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null)

  // Create item
  const createItem = useCallback(
    async (data: Omit<CreateItemRequest, 'recognition_id'>) => {
      try {
        setLoading(true)
        setError(null)

        const response = await apiFetch('/api/items/create', {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            recognition_id: session.recognition.id,
          }),
        })

        if (response.success && response.data) {
          // Add to local state
          const newItem: TrayItem = {
            id: response.data.item.id,
            recognition_id: response.data.item.recognition_id,
            item_type: response.data.item.item_type,
            source: response.data.item.source,
            recipe_line_option_id: response.data.item.recipe_line_option_id,
            menu_item_external_id: response.data.item.menu_item_external_id,
            metadata: response.data.item.metadata,
            is_modified: true,
            is_deleted: false,
            created_by: response.data.item.created_by,
            created_at: response.data.item.created_at,
            updated_at: response.data.item.updated_at,
          }
          setSession((prev) => ({
            ...prev,
            items: [...prev.items, newItem],
          }))
        }
      } catch (err) {
        setError('Failed to create item')
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    [session.recognition.id]
  )

  // Update item
  const updateItem = useCallback(async (id: number, data: UpdateItemRequest) => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch(`/api/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })

      if (response.success && response.data) {
        // Update local state
        setSession((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...data,
                  is_modified: true,
                  updated_at: new Date().toISOString(),
                }
              : item
          ),
        }))
      }
    } catch (err) {
      setError('Failed to update item')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Delete item
  const deleteItem = useCallback(async (id: number) => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch(`/api/items/${id}`, {
        method: 'DELETE',
      })

      if (response.success) {
        // Remove from local state
        setSession((prev) => ({
          ...prev,
          items: prev.items.filter((item) => item.id !== id),
        }))
        // Also remove annotations for this item
        setSession((prev) => ({
          ...prev,
          annotations: prev.annotations.filter((ann) => ann.tray_item_id !== id),
        }))
      }
    } catch (err) {
      setError('Failed to delete item')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Create annotation
  const createAnnotation = useCallback(
    async (data: Omit<CreateAnnotationRequest, 'image_id'> & { image_id: number }) => {
      try {
        setLoading(true)
        setError(null)

        const response = await apiFetch('/api/annotations/create', {
          method: 'POST',
          body: JSON.stringify(data),
        })

        if (response.success && response.data) {
          // Add to local state
          const newAnnotation: AnnotationView = {
            id: response.data.annotation.id,
            image_id: response.data.annotation.image_id,
            tray_item_id:
              response.data.annotation.current_tray_item_id ||
              response.data.annotation.initial_tray_item_id ||
              0,
            bbox: response.data.annotation.bbox,
            is_modified: true,
            is_deleted: false,
            created_by: response.data.annotation.created_by,
            created_at: response.data.annotation.created_at,
            updated_at: response.data.annotation.updated_at,
          }
          setSession((prev) => ({
            ...prev,
            annotations: [...prev.annotations, newAnnotation],
          }))
        }
      } catch (err) {
        setError('Failed to create annotation')
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Update annotation
  const updateAnnotation = useCallback(
    async (id: number, data: UpdateAnnotationRequest) => {
      try {
        setLoading(true)
        setError(null)

        const response = await apiFetch(`/api/annotations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        })

        if (response.success && response.data) {
          // Update local state
          setSession((prev) => ({
            ...prev,
            annotations: prev.annotations.map((ann) =>
              ann.id === id
                ? {
                    ...ann,
                    bbox: data.bbox || ann.bbox,
                    tray_item_id: data.tray_item_id ?? ann.tray_item_id,
                    is_modified: true,
                    updated_at: new Date().toISOString(),
                  }
                : ann
            ),
          }))
        }
      } catch (err) {
        setError('Failed to update annotation')
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Delete annotation
  const deleteAnnotation = useCallback(async (id: number) => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch(`/api/annotations/${id}`, {
        method: 'DELETE',
      })

      if (response.success) {
        // Remove from local state
        setSession((prev) => ({
          ...prev,
          annotations: prev.annotations.filter((ann) => ann.id !== id),
        }))
      }
    } catch (err) {
      setError('Failed to delete annotation')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Complete validation
  const completeValidation = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch('/api/validation/complete', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session.workLog.id }),
      })

      if (response.success) {
        // Redirect will be handled by caller
      }
    } catch (err) {
      setError('Failed to complete validation')
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id])

  // Abandon validation
  const abandonValidation = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch('/api/validation/abandon', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session.workLog.id }),
      })

      if (response.success) {
        // Redirect will be handled by caller
      }
    } catch (err) {
      setError('Failed to abandon validation')
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id])

  const value: ValidationSessionContextValue = {
    session,
    loading,
    error,
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
    completeValidation,
    abandonValidation,
  }

  return (
    <ValidationSessionContext.Provider value={value}>
      {children}
    </ValidationSessionContext.Provider>
  )
}

