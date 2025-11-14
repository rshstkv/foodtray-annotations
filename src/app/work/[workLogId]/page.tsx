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
import { apiFetch } from '@/lib/api-response'
import {
  ValidationSessionProvider,
  useValidationSession,
} from '@/contexts/ValidationSessionContext'
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
    deleteItem,
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    completeValidation,
    abandonValidation,
  } = useValidationSession()

  const [mode, setMode] = useState<'view' | 'draw' | 'edit'>('edit')
  const [activeImageId, setActiveImageId] = useState<number>(session.images[0]?.id || 0)
  const [showItemDialog, setShowItemDialog] = useState(false)

  const itemType = getItemTypeFromValidationType(session.workLog.validation_type)

  const handleItemSelect = (id: number) => {
    setSelectedItemId(id)
    // Подсветить все annotations этого item
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
      tray_item_id: selectedItemId,
      bbox,
    })
  }

  const handleComplete = async () => {
    try {
      await completeValidation()
      router.push('/work')
    } catch (err) {
      console.error('Failed to complete validation:', err)
    }
  }

  const handleAbandon = async () => {
    if (confirm('Вы уверены, что хотите отменить валидацию?')) {
      try {
        await abandonValidation()
        router.push('/work')
      } catch (err) {
        console.error('Failed to abandon validation:', err)
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
          />
        }
        images={
          <ImageGrid
            images={session.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={session.recipeLineOptions}
            selectedItemId={selectedItemId}
            mode={mode}
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={updateAnnotation}
            onAnnotationSelect={setSelectedAnnotationId}
          />
        }
        actions={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant={mode === 'view' ? 'default' : 'outline'}
                onClick={() => setMode('view')}
              >
                Просмотр
              </Button>
              <Button
                variant={mode === 'draw' ? 'default' : 'outline'}
                onClick={() => setMode('draw')}
              >
                Рисовать
              </Button>
              <Button
                variant={mode === 'edit' ? 'default' : 'outline'}
                onClick={() => setMode('edit')}
              >
                Редактировать
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleAbandon}>
                <XCircle className="w-4 h-4 mr-2" />
                Отменить
              </Button>
              <Button onClick={handleComplete}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Завершить
              </Button>
            </div>
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

