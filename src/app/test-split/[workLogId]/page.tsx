'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ValidationSessionHeader } from '@/components/validation/ValidationSessionHeader'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { ItemDialog } from '@/components/validation/ItemDialog'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import { useValidationSession } from '@/contexts/ValidationSessionContext'
import { TestSplitSessionProvider } from '@/contexts/TestSplitSessionContext'
import { apiFetch } from '@/lib/api-response'
import type { ValidationSession, BBox } from '@/types/domain'
import { getItemTypeFromValidationType } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { CheckCircle, XCircle } from 'lucide-react'

function TestSplitSessionContent() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const {
    session,
    loading,
    error,
    readOnly,
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
    validationStatus,
    completeValidation,
    abandonValidation,
    finishStep,
  } = useValidationSession()

  const mode = 'edit' as const
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  const itemType = getItemTypeFromValidationType(session!.workLog.validation_type)
  const capabilities = getValidationCapabilities(session!.workLog.validation_type)

  const handleItemSelect = useCallback((id: number) => {
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedAnnotationId(null)
    } else {
      setSelectedItemId(id)
      setSelectedAnnotationId(null)
    }
  }, [selectedItemId, setSelectedItemId, setSelectedAnnotationId])

  const handleItemCreate = () => {
    if (itemType === 'PLATE' || itemType === 'BOTTLE') {
      const newItemId = createItem({ type: itemType })
      if (newItemId !== null) {
        setSelectedItemId(newItemId)
        setSelectedAnnotationId(null)
      }
    } else {
      setShowItemDialog(true)
    }
  }

  const handleItemDialogSave = async (data: any) => {
    const newItemId = createItem(data)
    if (newItemId !== null) {
      setSelectedItemId(newItemId)
      setSelectedAnnotationId(null)
    }
    setShowItemDialog(false)
  }

  const handleAnnotationCreate = async (imageId: number, bbox: BBox) => {
    if (!selectedItemId) {
      alert('Сначала выберите item')
      return
    }
    const newAnnotationId = createAnnotation({
      image_id: imageId,
      work_item_id: selectedItemId,
      bbox,
    })
    if (newAnnotationId !== null) {
      setSelectedAnnotationId(newAnnotationId)
    }
  }

  const handleAnnotationSelect = (annotationId: number | string | null, itemId?: number) => {
    setSelectedAnnotationId(annotationId)
    if (annotationId && itemId) {
      setSelectedItemId(itemId)
    }
  }

  const handleAnnotationUpdate = (id: number | string, data: any) => {
    updateAnnotation(id, data)
  }

  const handleAnnotationDelete = (id: number | string) => {
    deleteAnnotation(id)
  }

  const handleAnnotationToggleOcclusion = (id: number | string) => {
    const ann = annotations.find(a => a.id === id)
    if (ann) {
      updateAnnotation(id, { is_occluded: !ann.is_occluded })
    }
  }

  const handleItemDelete = (id: number) => {
    deleteItem(id)
  }

  const handleItemUpdate = (id: number, data: any) => {
    updateItem(id, data)
  }

  const handleComplete = async () => {
    if (isCompleting) return

    try {
      setIsCompleting(true)

      if (hasUnsavedChanges) {
        await saveAllChanges()
      }

      const response = await apiFetch<{
        success: boolean
        next_session: ValidationSession | null
      }>('/api/test-split/complete', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session!.workLog.id }),
      })

      if (response.success && response.data?.next_session) {
        const next = response.data.next_session
        router.push(`/test-split/${next.workLog.id}`)
      } else {
        router.push('/test-split')
      }
    } catch (err) {
      console.error('Failed to complete:', err)
      alert('Ошибка при завершении проверки')
    } finally {
      setTimeout(() => setIsCompleting(false), 1000)
    }
  }

  const handleAbandon = async () => {
    const recognitionId = session!.recognition.id

    if (!confirm(`Отказаться от Recognition #${recognitionId}?\n\nRecognition вернется в очередь.`)) {
      return
    }

    try {
      await apiFetch('/api/test-split/abandon', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: session!.workLog.id }),
      })
      router.push('/test-split')
    } catch (err) {
      console.error('Failed to abandon:', err)
      alert('Ошибка при отказе от задачи')
    }
  }

  const handleReset = async () => {
    if (confirm('Откатить все изменения к исходному состоянию?')) {
      try {
        await resetToInitial()
      } catch (err) {
        console.error('Failed to reset:', err)
        alert('Ошибка при откате изменений')
      }
    }
  }

  const handleSelectFirstError = () => {
    if (validationStatus.itemErrors.size > 0) {
      const firstErrorItemId = Array.from(validationStatus.itemErrors.keys())[0]
      setSelectedItemId(firstErrorItemId)
      setSelectedAnnotationId(null)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (document.querySelector('[role="dialog"]')) return

      if (e.key === 'Escape') {
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
        return
      }

      if (e.key === 'Enter' && !readOnly && !isCompleting) {
        e.preventDefault()
        if (validationStatus.canComplete) {
          handleComplete()
        }
        return
      }

      const currentItemType = getItemTypeFromValidationType(session!.workLog.validation_type)
      const filteredItems = currentItemType
        ? items.filter(item => item.type === currentItemType)
        : items

      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (index < filteredItems.length) {
          handleItemSelect(filteredItems[index].id)
        }
        return
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (filteredItems.length === 0) return

        if (selectedItemId === null) {
          handleItemSelect(filteredItems[0].id)
        } else {
          const currentIndex = filteredItems.findIndex(item => item.id === selectedItemId)
          if (currentIndex !== -1) {
            const newIndex = e.key === 'ArrowLeft'
              ? (currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1)
              : (currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0)
            handleItemSelect(filteredItems[newIndex].id)
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedItemId, setSelectedAnnotationId, items, selectedItemId, session, readOnly, validationStatus.canComplete, handleComplete, handleItemSelect, isCompleting])

  return (
    <RootLayout
      userName={user?.full_name || undefined}
      userEmail={user?.email}
      isAdmin={isAdmin}
    >
      <WorkLayout
        header={
          <ValidationSessionHeader
            recognitionId={session!.recognition.id}
            validationType={session!.workLog.validation_type}
            hasUnsavedChanges={hasUnsavedChanges}
            validationStatus={validationStatus}
            onReset={readOnly ? undefined : handleReset}
            onSelectFirstError={handleSelectFirstError}
            readOnly={readOnly}
            validationSteps={session!.workLog.validation_steps}
            currentStepIndex={0}
            highlightedStepIndex={null}
          />
        }
        sidebar={
          <ItemsList
            items={items}
            annotations={annotations}
            validationType={session!.workLog.validation_type}
            selectedItemId={selectedItemId}
            recipeLines={session!.recipeLines}
            recipeLineOptions={session!.recipeLineOptions}
            isTestSplit={true}
            activeMenu={session!.activeMenu}
            onItemSelect={handleItemSelect}
            onItemCreate={handleItemCreate}
            onItemDelete={handleItemDelete}
            onItemUpdate={handleItemUpdate}
            mode={mode}
          />
        }
        images={
          <ImageGrid
            images={session!.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={session!.recipeLineOptions}
            selectedItemId={selectedItemId}
            selectedAnnotationId={selectedAnnotationId}
            validationType={session!.workLog.validation_type}
            mode={mode}
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationSelect={handleAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationToggleOcclusion={handleAnnotationToggleOcclusion}
          />
        }
        actions={
          !readOnly ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleAbandon}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Отказаться
              </Button>

              <Button
                onClick={handleComplete}
                disabled={!validationStatus.canComplete || isCompleting}
                title={
                  isCompleting ? 'Сохранение...' :
                  !validationStatus.canComplete ? 'Исправьте ошибки перед завершением' :
                  'Завершить проверку'
                }
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isCompleting ? 'Сохранение...' : 'Завершить проверку'}
                {!isCompleting && (
                  <kbd className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-white/20 rounded border border-white/30">
                    Enter
                  </kbd>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => router.back()}>
                Назад
              </Button>
            </div>
          )
        }
      />

      {itemType && (
        <ItemDialog
          open={showItemDialog}
          onClose={() => setShowItemDialog(false)}
          onSave={handleItemDialogSave}
          itemType={itemType}
          recipeLineOptions={session!.recipeLineOptions}
          activeMenu={session!.activeMenu}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </RootLayout>
  )
}

export default function TestSplitWorkSessionPage({
  params,
}: {
  params: Promise<{ workLogId: string }>
}) {
  const router = useRouter()
  const { workLogId } = use(params)
  const { user } = useUser()
  const [session, setSession] = useState<ValidationSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        const response = await apiFetch<{ session: ValidationSession }>(
          `/api/test-split/session/${workLogId}`
        )
        if (response.success && response.data) {
          const loadedSession = response.data.session

          if (loadedSession.workLog.status === 'abandoned' || loadedSession.workLog.status === 'completed') {
            router.push('/test-split')
            return
          }

          setSession(loadedSession)
        }
      } catch (error) {
        console.error('Failed to load test split session:', error)
        router.push('/test-split')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadSession()
    }
  }, [workLogId, user, router])

  if (!user || loading || !session) {
    return (
      <RootLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto" />
            <p className="mt-4 text-gray-600">Загрузка...</p>
          </div>
        </div>
      </RootLayout>
    )
  }

  return (
    <TestSplitSessionProvider
      key={workLogId}
      initialSession={session}
      readOnly={false}
    >
      <TestSplitSessionContent />
    </TestSplitSessionProvider>
  )
}
