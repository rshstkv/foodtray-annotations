'use client'

import { createContext, useContext, ReactNode } from 'react'
import { Annotation, AnnotationChange, Image } from '@/types/annotations'

interface AnnotationContextValue {
  images: Image[]
  annotations: Annotation[]
  changes: AnnotationChange[]
  hasUnsavedChanges: boolean
  
  // Actions
  createAnnotation: (annotation: Omit<Annotation, 'id' | 'created_at' | 'updated_at'>) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  deleteAnnotation: (id: string) => void
  
  // Selection
  selectedAnnotationId: string | null
  setSelectedAnnotationId: (id: string | null) => void
  
  // Drawing
  isDrawing: boolean
  startDrawing: (objectType: Annotation['object_type']) => void
  stopDrawing: () => void
  
  // Highlight (for sync between menu and images)
  highlightedDishIndex: number | null
  setHighlightedDishIndex: (index: number | null) => void
}

const AnnotationContext = createContext<AnnotationContextValue | null>(null)

export function useAnnotations() {
  const context = useContext(AnnotationContext)
  if (!context) {
    throw new Error('useAnnotations must be used within AnnotationProvider')
  }
  return context
}

export function AnnotationProvider({
  children,
  value,
}: {
  children: ReactNode
  value: AnnotationContextValue
}) {
  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>
}


