'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react'
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
import { validateSession, type SessionValidationResult } from '@/lib/validation-rules'

// Tracking для несохраненных изменений
interface ChangesTracking {
  createdItems: Map<number, TrayItem>  // temp ID -> item
  updatedItems: Map<number, Partial<TrayItem>>  // ID -> changes
  deletedItems: Set<number>  // IDs to delete
  
  createdAnnotations: Map<number | string, AnnotationView>  // temp ID -> annotation
  updatedAnnotations: Map<number | string, Partial<AnnotationView>>  // ID -> changes
  deletedAnnotations: Set<number | string>  // IDs to delete
}

interface ValidationSessionContextValue {
  session: ValidationSession | null
  loading: boolean
  error: string | null
  readOnly: boolean

  // Items
  items: TrayItem[]
  selectedItemId: number | null
  setSelectedItemId: (id: number | null) => void
  createItem: (data: Omit<CreateItemRequest, 'work_log_id' | 'recognition_id'>) => number | null
  updateItem: (id: number, data: UpdateItemRequest) => void
  deleteItem: (id: number) => void

  // Annotations
  annotations: AnnotationView[]
  selectedAnnotationId: number | string | null
  setSelectedAnnotationId: (id: number | string | null) => void
  createAnnotation: (data: Omit<CreateAnnotationRequest, 'work_log_id'> & { image_id: number }) => void
  updateAnnotation: (id: number | string, data: UpdateAnnotationRequest) => void
  deleteAnnotation: (id: number | string) => void

  // Changes tracking
  hasUnsavedChanges: boolean
  saveAllChanges: () => Promise<void>
  resetToInitial: () => Promise<void>

  // Validation status
  validationStatus: SessionValidationResult

  // Session actions
  completeValidation: () => Promise<void>
  abandonValidation: () => Promise<void>
  finishStep: (markAs: 'completed' | 'skipped') => Promise<void>
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
  readOnly?: boolean
}

export function ValidationSessionProvider({
  children,
  initialSession,
  readOnly = false,
}: ValidationSessionProviderProps) {
  const [session, setSession] = useState<ValidationSession>(initialSession)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | string | null>(null)
  const [isSaving, setIsSaving] = useState(false) // Защита от одновременных сохранений
  
  // Tracking изменений
  const [changesTracking, setChangesTracking] = useState<ChangesTracking>({
    createdItems: new Map(),
    updatedItems: new Map(),
    deletedItems: new Set(),
    createdAnnotations: new Map(),
    updatedAnnotations: new Map(),
    deletedAnnotations: new Set(),
  })
  
  // Счетчик для временных ID (отрицательные числа)
  const [tempIdCounter, setTempIdCounter] = useState(-1)
  
  // Проверка наличия несохраненных изменений
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

  // Автоматический abandon при закрытии страницы/вкладки (только для edit режима)
  useEffect(() => {
    if (readOnly) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Предупреждаем пользователя о несохраненных изменениях
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    const handleUnload = () => {
      // Отправляем синхронный запрос на abandon при закрытии страницы
      // Используем navigator.sendBeacon для надежности
      const blob = new Blob(
        [JSON.stringify({ work_log_id: session.workLog.id })],
        { type: 'application/json' }
      )
      navigator.sendBeacon('/api/validation/abandon', blob)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      
      // НЕ вызываем abandon в cleanup - это вызовется при каждом re-render!
      // Abandon должен вызываться только явно пользователем или при закрытии браузера
    }
  }, [readOnly, session.workLog.id, hasUnsavedChanges])

  // Create item (локально, без API)
  const createItem = useCallback(
    (data: Omit<CreateItemRequest, 'work_log_id' | 'recognition_id'>) => {
      console.log('[DEBUG createItem] Called with data:', data, 'at', new Date().toISOString())
      console.log('[DEBUG createItem] Stack trace:', new Error().stack)
      
      if (readOnly) {
        console.warn('[ValidationSession] Cannot create item in read-only mode')
        return null
      }
      
      // Защита от двойного клика: проверяем есть ли идентичный item созданный недавно (< 3 сек)
      const now = Date.now()
      const recentDuplicate = Array.from(changesTracking.createdItems.values()).find(item => {
        const itemAge = now - new Date(item.created_at).getTime()
        const isSameType = item.type === data.type
        const isSameMetadata = JSON.stringify(item.metadata) === JSON.stringify(data.metadata || null)
        return isSameType && isSameMetadata && itemAge < 3000 // 3 секунды
      })
      
      if (recentDuplicate) {
        console.warn('[ValidationSession] Duplicate item creation prevented (double-click protection)')
        return null
      }
      
      console.log('[DEBUG createItem] Creating temp item with tempIdCounter:', tempIdCounter)
      
      // Создаем временный ID
      const tempId = tempIdCounter
      setTempIdCounter(tempId - 1)
      
      const newItem: TrayItem = {
        id: tempId,
        work_log_id: session.workLog.id,
        initial_item_id: null, // новый item
        recognition_id: session.recognition.id,
        type: data.type,
        recipe_line_id: data.recipe_line_id || null,
        quantity: data.quantity || 1,
        bottle_orientation: data.bottle_orientation || null,
        metadata: data.metadata || null,
        is_deleted: false,
        is_modified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      
      // Добавляем в локальный state
      setSession((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }))
      
      // Добавляем в tracking
      setChangesTracking((prev) => {
        const newCreatedItems = new Map(prev.createdItems)
        newCreatedItems.set(tempId, newItem)
        return {
          ...prev,
          createdItems: newCreatedItems,
        }
      })
      
      // Возвращаем ID нового элемента
      return tempId
    },
    [session.workLog.id, session.recognition.id, tempIdCounter, readOnly, changesTracking.createdItems]
  )

  // Update item (локально, без API)
  const updateItem = useCallback((id: number, data: UpdateItemRequest) => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot update item in read-only mode')
      return
    }
    
    // Обновляем в локальном state
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
    
    // Добавляем в tracking
    setChangesTracking((prev) => {
      // Если это новый item (в createdItems), обновляем его там
      if (prev.createdItems.has(id)) {
        const newCreatedItems = new Map(prev.createdItems)
        const item = newCreatedItems.get(id)!
        newCreatedItems.set(id, { ...item, ...data })
        return {
          ...prev,
          createdItems: newCreatedItems,
        }
      }
      
      // Иначе добавляем в updatedItems
      const newUpdatedItems = new Map(prev.updatedItems)
      const existingChanges = newUpdatedItems.get(id) || {}
      newUpdatedItems.set(id, { ...existingChanges, ...data })
      return {
        ...prev,
        updatedItems: newUpdatedItems,
      }
    })
  }, [readOnly])

  // Delete item (локально, без API)
  const deleteItem = useCallback((id: number) => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot delete item in read-only mode')
      return
    }
    
    // Удаляем из локального state
    setSession((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
      // Также удаляем все аннотации этого item
      annotations: prev.annotations.filter((ann) => ann.work_item_id !== id),
    }))
    
    // Добавляем в tracking
    setChangesTracking((prev) => {
      // Если это был новый item (в createdItems), просто удаляем его из createdItems
      if (prev.createdItems.has(id)) {
        const newCreatedItems = new Map(prev.createdItems)
        newCreatedItems.delete(id)
        return {
          ...prev,
          createdItems: newCreatedItems,
        }
      }
      
      // Иначе добавляем в deletedItems
      const newDeletedItems = new Set(prev.deletedItems)
      newDeletedItems.add(id)
      
      // Удаляем из updatedItems если был там
      const newUpdatedItems = new Map(prev.updatedItems)
      newUpdatedItems.delete(id)
      
      return {
        ...prev,
        updatedItems: newUpdatedItems,
        deletedItems: newDeletedItems,
      }
    })
  }, [readOnly])

  // Create annotation (локально, без API)
  const createAnnotation = useCallback(
    (data: Omit<CreateAnnotationRequest, 'work_log_id'> & { image_id: number }) => {
      if (readOnly) {
        console.warn('[ValidationSession] Cannot create annotation in read-only mode')
        return
      }
      
      // Создаем временный number ID (отрицательный для отличия от реальных)
      const tempId = -(Date.now() + Math.floor(Math.random() * 10000))
      
      const newAnnotation: AnnotationView = {
        id: tempId,
        work_log_id: session.workLog.id,
        initial_annotation_id: null, // новая аннотация
        image_id: data.image_id,
        work_item_id: data.work_item_id,
        bbox: data.bbox,
        is_deleted: false,
        is_occluded: data.is_occluded || false,
        occlusion_metadata: null,
        is_modified: true,
        is_temp: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      
      // Добавляем в локальный state
      setSession((prev) => ({
        ...prev,
        annotations: [...prev.annotations, newAnnotation],
      }))
      
      // Добавляем в tracking
      setChangesTracking((prev) => {
        const newCreatedAnnotations = new Map(prev.createdAnnotations)
        newCreatedAnnotations.set(tempId, newAnnotation)
        return {
          ...prev,
          createdAnnotations: newCreatedAnnotations,
        }
      })
    },
    [session.workLog.id, readOnly]
  )

  // Update annotation (локально, без API)
  const updateAnnotation = useCallback(
    (id: number | string, data: UpdateAnnotationRequest) => {
      if (readOnly) {
        console.warn('[ValidationSession] Cannot update annotation in read-only mode')
        return
      }
      
      // Обновляем в локальном state
      setSession((prev) => ({
        ...prev,
        annotations: prev.annotations.map((ann) =>
          ann.id === id
            ? {
                ...ann,
                bbox: data.bbox || ann.bbox,
                work_item_id: data.work_item_id ?? ann.work_item_id,
                is_occluded: data.is_occluded ?? ann.is_occluded,
                is_modified: true,
                updated_at: new Date().toISOString(),
              }
            : ann
        ),
      }))
      
      // Добавляем в tracking
      setChangesTracking((prev) => {
        // Если это новая аннотация (в createdAnnotations), обновляем её там
        if (prev.createdAnnotations.has(id)) {
          const newCreatedAnnotations = new Map(prev.createdAnnotations)
          const ann = newCreatedAnnotations.get(id)!
          newCreatedAnnotations.set(id, { ...ann, ...data })
          return {
            ...prev,
            createdAnnotations: newCreatedAnnotations,
          }
        }
        
        // Иначе добавляем в updatedAnnotations
        const newUpdatedAnnotations = new Map(prev.updatedAnnotations)
        const existingChanges = newUpdatedAnnotations.get(id) || {}
        newUpdatedAnnotations.set(id, { ...existingChanges, ...data })
        return {
          ...prev,
          updatedAnnotations: newUpdatedAnnotations,
        }
      })
    },
    [readOnly]
  )

  // Delete annotation (локально, без API)
  const deleteAnnotation = useCallback((id: number | string) => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot delete annotation in read-only mode')
      return
    }
    
    // Удаляем из локального state
    setSession((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((ann) => ann.id !== id),
    }))
    
    // Добавляем в tracking
    setChangesTracking((prev) => {
      // Если это была новая аннотация (в createdAnnotations), просто удаляем её из createdAnnotations
      if (prev.createdAnnotations.has(id)) {
        const newCreatedAnnotations = new Map(prev.createdAnnotations)
        newCreatedAnnotations.delete(id)
        return {
          ...prev,
          createdAnnotations: newCreatedAnnotations,
        }
      }
      
      // Иначе добавляем в deletedAnnotations
      const newDeletedAnnotations = new Set(prev.deletedAnnotations)
      newDeletedAnnotations.add(id)
      
      // Удаляем из updatedAnnotations если была там
      const newUpdatedAnnotations = new Map(prev.updatedAnnotations)
      newUpdatedAnnotations.delete(id)
      
      return {
        ...prev,
        updatedAnnotations: newUpdatedAnnotations,
        deletedAnnotations: newDeletedAnnotations,
      }
    })
  }, [readOnly])

  // Сохранить все изменения в БД
  const saveAllChanges = useCallback(async () => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot save changes in read-only mode')
      return
    }
    
    if (!hasUnsavedChanges) {
      return
    }
    
    // Защита от одновременных вызовов (race condition)
    if (isSaving) {
      console.warn('[ValidationSession] Save already in progress, skipping duplicate call')
      return
    }
    
    try {
      setIsSaving(true)
      setLoading(true)
      setError(null)
      
      console.log('[DEBUG saveAllChanges] Starting save with createdItems:', changesTracking.createdItems.size)
      console.log('[DEBUG saveAllChanges] createdItems details:', Array.from(changesTracking.createdItems.entries()))
      
      // 1. Создаем новые items и маппим временные ID на реальные
      const itemIdMapping = new Map<number, number>() // tempId -> realId
      
      for (const [tempId, item] of changesTracking.createdItems) {
        console.log('[DEBUG saveAllChanges] Creating item via API for tempId:', tempId, 'item:', item, 'at', new Date().toISOString())
        
        const response = await apiFetch('/api/items/create', {
          method: 'POST',
          body: JSON.stringify({
            work_log_id: session.workLog.id,
            recognition_id: session.recognition.id,
            type: item.type,
            recipe_line_id: item.recipe_line_id,
            quantity: item.quantity,
            metadata: item.metadata,
            bottle_orientation: item.bottle_orientation,
          }),
        })
        
        console.log('[DEBUG saveAllChanges] API response for tempId:', tempId, 'response:', response)
        
        if (response.success && response.data) {
          const realId = (response.data as any).item.id
          console.log('[DEBUG saveAllChanges] Item created successfully, tempId:', tempId, '-> realId:', realId)
          itemIdMapping.set(tempId, realId)
          
          // Обновляем ID в session
          setSession((prev) => ({
            ...prev,
            items: prev.items.map((i) => 
              i.id === tempId ? { ...i, id: realId } : i
            ),
            annotations: prev.annotations.map((a) =>
              a.work_item_id === tempId ? { ...a, work_item_id: realId } : a
            ),
          }))
        } else {
          console.error('[DEBUG saveAllChanges] Failed to create item for tempId:', tempId)
        }
      }
      
      console.log('[DEBUG saveAllChanges] Finished creating items, itemIdMapping:', Array.from(itemIdMapping.entries()))
      
      // 2. Обновляем существующие items
      for (const [id, changes] of changesTracking.updatedItems) {
        const response = await apiFetch(`/api/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        })
        
        // Если обновили selected_option_id - обновляем is_selected локально
        if (response.success && changes.selected_option_id && changes.recipe_line_id) {
          console.log('[saveAllChanges] Item updated with ambiguity resolution, updating recipe_line_options locally')
          
          setSession((prev) => ({
            ...prev,
            recipeLineOptions: prev.recipeLineOptions.map(opt => {
              // Если это тот recipe_line для которого мы выбрали option
              if (opt.recipe_line_id === changes.recipe_line_id) {
                // Пометить выбранный option как is_selected, остальные - false
                return {
                  ...opt,
                  is_selected: opt.id === changes.selected_option_id
                }
              }
              return opt
            })
          }))
          
          console.log('[saveAllChanges] ✓ Updated recipe_line_options locally: selected option', changes.selected_option_id)
        }
      }
      
      // 3. Удаляем items
      for (const id of changesTracking.deletedItems) {
        await apiFetch(`/api/items/${id}`, {
          method: 'DELETE',
        })
      }
      
      // 4. Создаем новые аннотации (обновляем work_item_id если это был новый item)
      for (const [tempId, ann] of changesTracking.createdAnnotations) {
        // Если annotation ссылается на временный item ID, заменяем на реальный
        const actualWorkItemId = itemIdMapping.get(ann.work_item_id) || ann.work_item_id
        
        const response = await apiFetch('/api/annotations/create', {
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
          // Обновляем ID в session
          setSession((prev) => ({
            ...prev,
            annotations: prev.annotations.map((a) => 
              a.id === tempId ? { ...a, id: realId, is_temp: false } : a
            ),
          }))
        }
      }
      
      // 5. Обновляем существующие аннотации
      for (const [id, changes] of changesTracking.updatedAnnotations) {
        await apiFetch(`/api/annotations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        })
      }
      
      // 6. Удаляем аннотации
      for (const id of changesTracking.deletedAnnotations) {
        await apiFetch(`/api/annotations/${id}`, {
          method: 'DELETE',
        })
      }
      
      // Очищаем tracking после успешного сохранения
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
  
  // Reset к начальному состоянию
  const resetToInitial = useCallback(async () => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot reset in read-only mode')
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await apiFetch(`/api/validation/${session.workLog.id}/reset`, {
        method: 'POST',
      })
      
      if (response && response.success && response.data) {
        // Обновляем session с новыми данными
        const data = response.data as any
        
        setSession((prev) => ({
          ...prev,
          items: data.items,
          annotations: data.annotations,
        }))
        
        // Очищаем tracking
        setChangesTracking({
          createdItems: new Map(),
          updatedItems: new Map(),
          deletedItems: new Set(),
          createdAnnotations: new Map(),
          updatedAnnotations: new Map(),
          deletedAnnotations: new Set(),
        })
        
        // Сбрасываем выделение
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
      } else {
        console.error('[ValidationSession] Reset failed:', response)
      }
    } catch (err) {
      setError('Failed to reset to initial state')
      console.error('[ValidationSession] Reset error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id, readOnly])

  // Complete validation
  const completeValidation = useCallback(async () => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot complete validation in read-only mode')
      return
    }
    
    try {
      setLoading(true)
      setError(null)

      // Сохранить все несохраненные изменения перед завершением валидации
      if (hasUnsavedChanges) {
        console.log('[ValidationSession] Saving changes before completing validation')
        await saveAllChanges()
      }

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
  }, [session.workLog.id, readOnly, hasUnsavedChanges, saveAllChanges])

  // Abandon validation
  const abandonValidation = useCallback(async () => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot abandon validation in read-only mode')
      return
    }
    
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
  }, [session.workLog.id, readOnly])

  // Next step (multi-step validation)
  // Универсальная функция для завершения этапа
  const finishStep = useCallback(async (markAs: 'completed' | 'skipped') => {
    if (readOnly) {
      console.warn('[ValidationSession] Cannot finish step in read-only mode')
      return
    }
    
    try {
      setLoading(true)
      setError(null)

      // Если отмечаем как completed, сохраняем изменения
      if (markAs === 'completed' && hasUnsavedChanges) {
        console.log('[ValidationSession] Saving changes before finishing step')
        await saveAllChanges()
      }

      // Вызвать универсальное API
      const response = await apiFetch<{
        has_more_steps: boolean
        current_step_index?: number
        current_step?: any
        next_work_log_id?: number | null
      }>('/api/validation/finish-step', {
        method: 'POST',
        body: JSON.stringify({ 
          work_log_id: session.workLog.id,
          mark_as: markAs
        }),
      })

      if (!response.success || !response.data) {
        throw new Error('Failed to finish step')
      }

      if (response.data.has_more_steps) {
        // Есть следующий этап - обновляем локальный state
        setSession((prev) => ({
          ...prev,
          workLog: {
            ...prev.workLog,
            current_step_index: response.data.current_step_index!,
            validation_type: response.data.current_step!.type,
            validation_steps: prev.workLog.validation_steps?.map((s, i) => {
              if (i === prev.workLog.current_step_index) return { ...s, status: markAs }
              if (i === response.data.current_step_index) return { ...s, status: 'in_progress' }
              return s
            }),
          },
        }))
        
        // Очистить tracking
        setChangesTracking({
          createdItems: new Map(),
          updatedItems: new Map(),
          deletedItems: new Set(),
          createdAnnotations: new Map(),
          updatedAnnotations: new Map(),
          deletedAnnotations: new Set(),
        })
        
        console.log(`[ValidationSession] Step marked as ${markAs}, moved to step ${response.data.current_step_index}`)
      } else {
        // Последний этап - редиректим
        const nextWorkLogId = response.data.next_work_log_id
        
        if (nextWorkLogId) {
          // Перейти к следующей задаче
          window.location.href = `/work/${nextWorkLogId}`
        } else {
          // Задач нет - на главную
          window.location.href = '/work'
        }
      }
    } catch (err) {
      setError(`Failed to ${markAs === 'completed' ? 'complete' : 'skip'} step`)
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [session.workLog.id, readOnly, hasUnsavedChanges, saveAllChanges])


  // Вычисляем статус валидации в реальном времени (только для edit режима)
  const validationStatus = useMemo(() => {
    if (readOnly) {
      // Для read-only режима возвращаем пустой статус с правильной структурой
      return {
        canComplete: false,
        itemErrors: new Map<number, string[]>(),
        globalErrors: []
      }
    }
    return validateSession(
      session.items,
      session.annotations,
      session.images,
      session.recipeLines,
      session.workLog.validation_type,
      session.recipeLineOptions
    )
  }, [readOnly, session.items, session.annotations, session.images, session.recipeLines, session.recipeLineOptions, session.workLog.validation_type])

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
  }

  return (
    <ValidationSessionContext.Provider value={value}>
      {children}
    </ValidationSessionContext.Provider>
  )
}

