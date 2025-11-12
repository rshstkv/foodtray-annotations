'use client'

import { useState, useCallback } from 'react'
import { Annotation, AnnotationChange, Image } from '@/types/annotations'

export interface UseAnnotationManagerReturn {
  annotations: Annotation[]
  changes: AnnotationChange[]
  hasUnsavedChanges: boolean
  selectedAnnotationId: string | null
  highlightedDishIndex: number | null
  isDrawing: boolean
  drawingObjectType: Annotation['object_type'] | null
  
  // Actions
  setAnnotations: (annotations: Annotation[]) => void
  createAnnotation: (annotation: Omit<Annotation, 'id' | 'created_at' | 'updated_at'>) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  deleteAnnotation: (id: string) => void
  clearChanges: () => void
  resetChanges: () => void  // Новый метод для отката изменений
  
  // Selection
  setSelectedAnnotationId: (id: string | null) => void
  selectNext: () => void
  selectPrev: () => void
  
  // Drawing
  startDrawing: (objectType: Annotation['object_type']) => void
  stopDrawing: () => void
  
  // Highlight (for sync between menu and images)
  setHighlightedDishIndex: (index: number | null) => void
}

export function useAnnotationManager(initialImages: Image[] = []): UseAnnotationManagerReturn {
  const [originalAnnotations] = useState<Annotation[]>(() => {
    return initialImages.flatMap(img => img.annotations || [])
  })
  const [annotations, setAnnotationsState] = useState<Annotation[]>(() => {
    return initialImages.flatMap(img => img.annotations || [])
  })
  const [changes, setChanges] = useState<AnnotationChange[]>([])
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [highlightedDishIndex, setHighlightedDishIndex] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingObjectType, setDrawingObjectType] = useState<Annotation['object_type'] | null>(null)

  const hasUnsavedChanges = changes.length > 0

  const setAnnotations = useCallback((newAnnotations: Annotation[]) => {
    setAnnotationsState(newAnnotations)
  }, [])

  const createAnnotation = useCallback((annotation: Omit<Annotation, 'id' | 'created_at' | 'updated_at'>) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: `temp_${Date.now()}_${Math.random()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
    }
    
    setAnnotationsState(prev => [...prev, newAnnotation])
    setChanges(prev => [...prev, { type: 'create', annotation: newAnnotation }])
    
    // Автоматически выбираем созданную аннотацию
    setSelectedAnnotationId(newAnnotation.id)
  }, [])

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotationsState(prev => prev.map(a => 
      a.id === id 
        ? { ...a, ...updates, updated_at: new Date().toISOString() } 
        : a
    ))
    
    const original = annotations.find(a => a.id === id)
    if (original) {
      setChanges(prev => [...prev, { 
        type: 'update', 
        annotation: { id, image_id: original.image_id, ...updates }, 
        originalAnnotation: original 
      }])
    }
  }, [annotations])

  const deleteAnnotation = useCallback((id: string) => {
    const original = annotations.find(a => a.id === id)
    if (!original) return

    // Мягкое удаление
    setAnnotationsState(prev => prev.map(a => 
      a.id === id 
        ? { ...a, is_deleted: true, updated_at: new Date().toISOString() } 
        : a
    ))
    
    setChanges(prev => [...prev, { 
      type: 'delete', 
      annotation: { ...original, is_deleted: true } 
    }])
    
    // Снимаем выделение если удаляем выбранную аннотацию
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null)
    }
  }, [annotations, selectedAnnotationId])

  const clearChanges = useCallback(() => {
    setChanges([])
  }, [])

  const selectNext = useCallback(() => {
    const visibleAnnotations = annotations.filter(a => !a.is_deleted)
    if (visibleAnnotations.length === 0) return

    const currentIndex = selectedAnnotationId 
      ? visibleAnnotations.findIndex(a => a.id === selectedAnnotationId)
      : -1

    const nextIndex = (currentIndex + 1) % visibleAnnotations.length
    setSelectedAnnotationId(visibleAnnotations[nextIndex].id)
  }, [annotations, selectedAnnotationId])

  const selectPrev = useCallback(() => {
    const visibleAnnotations = annotations.filter(a => !a.is_deleted)
    if (visibleAnnotations.length === 0) return

    const currentIndex = selectedAnnotationId 
      ? visibleAnnotations.findIndex(a => a.id === selectedAnnotationId)
      : -1

    const prevIndex = currentIndex <= 0 
      ? visibleAnnotations.length - 1 
      : currentIndex - 1
    
    setSelectedAnnotationId(visibleAnnotations[prevIndex].id)
  }, [annotations, selectedAnnotationId])

  const startDrawing = useCallback((objectType: Annotation['object_type']) => {
    setIsDrawing(true)
    setDrawingObjectType(objectType)
    setSelectedAnnotationId(null) // Снимаем выделение при начале рисования
  }, [])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
    setDrawingObjectType(null)
  }, [])

  const resetChanges = useCallback(() => {
    // Откатить все изменения к оригинальному состоянию
    setAnnotationsState(JSON.parse(JSON.stringify(originalAnnotations)))
    setChanges([])
    setSelectedAnnotationId(null)
  }, [originalAnnotations])

  return {
    annotations,
    changes,
    hasUnsavedChanges,
    selectedAnnotationId,
    highlightedDishIndex,
    isDrawing,
    drawingObjectType,
    setAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    resetChanges,
    clearChanges,
    setSelectedAnnotationId,
    selectNext,
    selectPrev,
    startDrawing,
    stopDrawing,
    setHighlightedDishIndex,
  }
}

