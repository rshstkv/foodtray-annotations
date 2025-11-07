/**
 * Buzzer Annotation Task
 * Разметка баззеров на изображениях
 * 
 * Цель: Нарисовать bbox для всех баззеров и указать их цвет
 * Цвета: синий, красный, зеленый, белый
 */

'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTaskEngine } from '@/hooks/useTaskEngine'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useHotkeys } from '@/hooks/useHotkeys'
import dynamic from 'next/dynamic'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

const BUZZER_COLORS = [
  { value: 'blue', label: 'Синий', color: '#3b82f6' },
  { value: 'red', label: 'Красный', color: '#ef4444' },
  { value: 'green', label: 'Зеленый', color: '#22c55e' },
  { value: 'white', label: 'Белый', color: '#ffffff' },
] as const

type BuzzerColor = typeof BUZZER_COLORS[number]['value']

export default function BuzzerAnnotationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const {
    taskData,
    loading,
    completing,
    completeTask,
    skipTask,
  } = useTaskEngine({
    taskType: 'buzzer_annotation',
    tier: tier ? parseInt(tier) : undefined,
  })

  const {
    images,
    setLocalImages,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
  } = useAnnotations(taskData?.images || [])

  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
  const [pendingBBox, setPendingBBox] = useState<{
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
    image_id: number
  } | null>(null)

  // Sync taskData images to annotations hook
  if (taskData && taskData.images !== images) {
    setLocalImages(taskData.images)
  }

  const mainImage = images?.find((img: Image) => img.photo_type === 'Main')
  const qualifyingImage = images?.find((img: Image) => img.photo_type === 'Qualifying')

  const mainBuzzerCount = mainImage?.annotations.filter((a) => a.object_type === 'buzzer').length || 0
  const qualBuzzerCount = qualifyingImage?.annotations.filter((a) => a.object_type === 'buzzer').length || 0

  // Handlers
  const handleAnnotationCreate = async (
    imageId: number,
    bbox: {
      bbox_x1: number
      bbox_y1: number
      bbox_x2: number
      bbox_y2: number
    }
  ) => {
    setPendingBBox({ ...bbox, image_id: imageId })
  }

  const finishAnnotationCreate = async (color: BuzzerColor) => {
    if (!pendingBBox) return

    await createAnnotation({
      image_id: pendingBBox.image_id,
      object_type: 'buzzer',
      object_subtype: color,
      dish_index: null,
      bbox_x1: pendingBBox.bbox_x1,
      bbox_y1: pendingBBox.bbox_y1,
      bbox_x2: pendingBBox.bbox_x2,
      bbox_y2: pendingBBox.bbox_y2,
      is_overlapped: false,
      is_bottle_up: null,
      is_error: false,
    })

    setPendingBBox(null)
    setDrawingMode(true) // Continue drawing
  }

  const handleComplete = async () => {
    if (mainBuzzerCount === 0 || qualBuzzerCount === 0) {
      const confirmed = confirm('Вы уверены? На одной из картинок нет размеченных баззеров.')
      if (!confirmed) return
    }

    await completeTask()
  }

  // Hotkeys
  useHotkeys([
    {
      key: 'd',
      handler: () => setDrawingMode((prev) => !prev),
    },
    {
      key: 'Delete',
      handler: () => {
        if (selectedAnnotation) {
          deleteAnnotation(selectedAnnotation.id)
        }
      },
    },
    {
      key: 'Backspace',
      handler: (e) => {
        e.preventDefault()
        if (selectedAnnotation) {
          deleteAnnotation(selectedAnnotation.id)
        }
      },
    },
    {
      key: 'Escape',
      handler: () => {
        if (pendingBBox) {
          setPendingBBox(null)
          return
        }
        if (selectedAnnotation) {
          setSelectedAnnotation(null)
          return
        }
        skipTask()
      },
    },
    {
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        setActiveImage((prev) => (prev === 'Main' ? 'Qualifying' : 'Main'))
      },
    },
    {
      key: 'Enter',
      handler: (e) => {
        e.preventDefault()
        handleComplete()
      },
    },
  ])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка задачи...</div>
      </div>
    )
  }

  if (!taskData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Нет доступных задач</h2>
          <p className="text-gray-600 mb-6">
            Все задачи разметки баззеров {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">🔔 Разметка баззеров</h1>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier{' '}
                {taskData.recognition.tier}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Buzzer count */}
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Main</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {mainBuzzerCount}
                  </div>
                </div>
                <div className="text-gray-400">&</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Qualifying</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {qualBuzzerCount}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="border-l pl-4 flex items-center gap-2">
                <Button variant="outline" onClick={skipTask}>
                  Пропустить (Esc)
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={completing}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {completing ? 'Сохранение...' : '✓ Готово'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hotkeys hint */}
      <Card className="max-w-[1920px] mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> D - рисовать | Del -
          удалить | Tab - переключить Main/Qualifying | Enter - завершить | Esc - отмена
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Main Image */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Main (45°)</h3>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500">
                  {mainBuzzerCount} баззеров
                </Badge>
                <Button
                  size="sm"
                  variant={
                    activeImage === 'Main' && drawingMode
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => {
                    setActiveImage('Main')
                    setDrawingMode(true)
                  }}
                >
                  Рисовать (D)
                </Button>
              </div>
            </div>
            <div
              className="h-[calc(100vh-280px)] rounded border relative bg-gray-100 cursor-pointer"
              onClick={() => setActiveImage('Main')}
            >
              {mainImage && (
                <BBoxAnnotator
                  imageUrl={`/api/bbox-images/${mainImage.storage_path}`}
                  annotations={mainImage.annotations.filter(a => a.object_type === 'buzzer')}
                  originalAnnotations={mainImage.original_annotations}
                  imageId={mainImage.id}
                  onAnnotationCreate={(bbox) =>
                    handleAnnotationCreate(mainImage.id, bbox)
                  }
                  onAnnotationUpdate={updateAnnotation}
                  onAnnotationSelect={setSelectedAnnotation}
                  selectedAnnotation={
                    activeImage === 'Main' ? selectedAnnotation : null
                  }
                  drawingMode={activeImage === 'Main' && drawingMode}
                  readOnly={false}
                  referenceWidth={1810}
                  referenceHeight={1080}
                />
              )}
            </div>
          </Card>

          {/* Qualifying Image */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Qualifying (90°)</h3>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500">
                  {qualBuzzerCount} баззеров
                </Badge>
                <Button
                  size="sm"
                  variant={
                    activeImage === 'Qualifying' && drawingMode
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => {
                    setActiveImage('Qualifying')
                    setDrawingMode(true)
                  }}
                >
                  Рисовать (D)
                </Button>
              </div>
            </div>
            <div
              className="h-[calc(100vh-280px)] rounded border relative bg-gray-100 cursor-pointer"
              onClick={() => setActiveImage('Qualifying')}
            >
              {qualifyingImage && (
                <BBoxAnnotator
                  imageUrl={`/api/bbox-images/${qualifyingImage.storage_path}`}
                  annotations={qualifyingImage.annotations.filter(a => a.object_type === 'buzzer')}
                  originalAnnotations={qualifyingImage.original_annotations}
                  imageId={qualifyingImage.id}
                  onAnnotationCreate={(bbox) =>
                    handleAnnotationCreate(qualifyingImage.id, bbox)
                  }
                  onAnnotationUpdate={updateAnnotation}
                  onAnnotationSelect={setSelectedAnnotation}
                  selectedAnnotation={
                    activeImage === 'Qualifying' ? selectedAnnotation : null
                  }
                  drawingMode={activeImage === 'Qualifying' && drawingMode}
                  readOnly={false}
                  referenceWidth={1410}
                  referenceHeight={1080}
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal для выбора цвета баззера */}
      {pendingBBox && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Выберите цвет баззера:</h3>
            <div className="grid grid-cols-2 gap-3">
              {BUZZER_COLORS.map((buzzer) => (
                <button
                  key={buzzer.value}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors rounded border-2 border-gray-200 hover:border-blue-400"
                  onClick={() => finishAnnotationCreate(buzzer.value)}
                >
                  <div
                    className="w-8 h-8 rounded border-2 border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: buzzer.color }}
                  />
                  <span className="text-sm font-medium">{buzzer.label}</span>
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => setPendingBBox(null)}
            >
              Отмена (Esc)
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}

