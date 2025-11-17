'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ValidationSessionHeader } from '@/components/validation/ValidationSessionHeader'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { AnnotationsList } from '@/components/validation/AnnotationsList'
import { ItemDialog } from '@/components/validation/ItemDialog'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import {
  ValidationSessionProvider,
  useValidationSession,
} from '@/contexts/ValidationSessionContext'
import { apiFetch } from '@/lib/api-response'
import type { ValidationSession, BBox } from '@/types/domain'
import { getItemTypeFromValidationType } from '@/types/domain'
import { CheckCircle, XCircle } from 'lucide-react'

function ValidationSessionContent() {
  const router = useRouter()
  const {
    session,
    loading,
    error,
    items,
    selectedItemId,
    setSelectedItemId,
    createItem,
    updateItem,
    deleteItem,
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    hasUnsavedChanges,
    saveAllChanges,
    resetToInitial,
    completeValidation,
    abandonValidation,
  } = useValidationSession()

  // Всегда режим редактирования для этой задачи
  const mode = 'edit' as const
  const [showItemDialog, setShowItemDialog] = useState(false)

  const itemType = getItemTypeFromValidationType(session.workLog.validation_type)

  // Обработка Escape для снятия выделения
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedItemId, setSelectedAnnotationId])

  const handleItemSelect = (id: number) => {
    // Если кликаем на уже выбранный item - снимаем выделение
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedAnnotationId(null)
    } else {
      setSelectedItemId(id)
      setSelectedAnnotationId(null)
    }
  }

  const handleItemCreate = () => {
    setShowItemDialog(true)
  }

  const handleItemDialogSave = async (data: any) => {
    await createItem(data)
    setShowItemDialog(false)
  }

  const handleAnnotationCreate = async (imageId: number, bbox: BBox) => {
    if (!selectedItemId) {
      alert('Сначала выберите item')
      return
    }
    await createAnnotation({
      image_id: imageId,
      work_item_id: selectedItemId,
      bbox,
    })
  }

  const handleAnnotationSelect = (annotationId: number | string | null, itemId?: number) => {
    setSelectedAnnotationId(annotationId)
    // Если выбрана аннотация и передан itemId, автоматически выбираем item
    if (annotationId && itemId) {
      setSelectedItemId(itemId)
    }
  }

  const handleComplete = async () => {
    try {
      // Сначала сохраняем все изменения
      if (hasUnsavedChanges) {
        await saveAllChanges()
      }
      // Затем помечаем как завершенную
      await completeValidation()
      router.push('/work')
    } catch (err) {
      console.error('Failed to complete validation:', err)
      alert('Ошибка при завершении валидации')
    }
  }

  const handleSkip = async () => {
    if (hasUnsavedChanges) {
      if (!confirm('У вас есть несохраненные изменения. Вы уверены, что хотите пропустить эту задачу? Все изменения будут потеряны.')) {
        return
      }
    } else {
      if (!confirm('Вы уверены, что хотите пропустить эту задачу?')) {
        return
      }
    }
    
    try {
      await abandonValidation()
      router.push('/work')
    } catch (err) {
      console.error('Failed to skip validation:', err)
      alert('Ошибка при пропуске задачи')
    }
  }

  const handleReset = async () => {
    if (confirm('Вы уверены, что хотите откатить все изменения к исходному состоянию?')) {
      try {
        await resetToInitial()
      } catch (err) {
        console.error('Failed to reset:', err)
        alert('Ошибка при откате изменений')
      }
    }
  }

  return (
    <>
      <WorkLayout
        header={
          <ValidationSessionHeader
            recognitionId={session.recognition.id}
            validationType={session.workLog.validation_type}
            hasUnsavedChanges={hasUnsavedChanges}
            onReset={handleReset}
          />
        }
        sidebar={
          <ItemsList
            items={items}
            validationType={session.workLog.validation_type}
            selectedItemId={selectedItemId}
            recipeLineOptions={session.recipeLineOptions}
            onItemSelect={handleItemSelect}
            onItemCreate={handleItemCreate}
            onItemDelete={deleteItem}
            onItemUpdate={updateItem}
          />
        }
        images={
          <ImageGrid
            images={session.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={session.recipeLineOptions}
            selectedItemId={selectedItemId}
            validationType={session.workLog.validation_type}
            mode={mode}
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={updateAnnotation}
            onAnnotationSelect={handleAnnotationSelect}
            onAnnotationDelete={deleteAnnotation}
            onAnnotationToggleOcclusion={(id) => {
              const ann = annotations.find(a => a.id === id)
              if (ann) {
                updateAnnotation(id, { 
                  is_occluded: !ann.is_occluded 
                })
              }
            }}
          />
        }
        actions={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={handleSkip}>
              <XCircle className="w-4 h-4 mr-2" />
              Пропустить
            </Button>
            <Button onClick={handleComplete}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Завершить
            </Button>
          </div>
        }
      />

      {itemType && (
        <ItemDialog
          open={showItemDialog}
          onClose={() => setShowItemDialog(false)}
          onSave={handleItemDialogSave}
          itemType={itemType}
          recipeLineOptions={session.recipeLineOptions}
          activeMenu={session.activeMenu}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </>
  )
}

export default function WorkSessionPage({ params }: { params: Promise<{ workLogId: string }> }) {
  const { workLogId } = use(params)
  const { user, isAdmin } = useUser()
  const [session, setSession] = useState<ValidationSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        const response = await apiFetch<{ session: ValidationSession }>(
          `/api/validation/session/${workLogId}`
        )
        if (response.success && response.data) {
          setSession(response.data.session)
        }
      } catch (error) {
        console.error('Failed to load session:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadSession()
    }
  }, [workLogId, user])

  if (!user || loading || !session) {
    return (
      <RootLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка...</p>
          </div>
        </div>
      </RootLayout>
    )
  }

  return (
    <ValidationSessionProvider initialSession={session}>
      <ValidationSessionContent />
    </ValidationSessionProvider>
  )
}

