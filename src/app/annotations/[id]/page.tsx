'use client'

import { useEffect, useState, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useHotkeys } from '@/hooks/useHotkeys'
import { DishList } from '@/components/tasks/DishList'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

// Non-food объекты
const NON_FOOD_OBJECTS = [
  { id: 'hand', name: 'Рука', icon: '✋' },
  { id: 'phone', name: 'Телефон', icon: '📱' },
  { id: 'card', name: 'Карта', icon: '💳' },
  { id: 'bag', name: 'Сумка', icon: '👜' },
  { id: 'bottle', name: 'Бутылка', icon: '🍾' },
  { id: 'cup', name: 'Стакан', icon: '🥤' },
  { id: 'napkin', name: 'Салфетка', icon: '🧻' },
  { id: 'utensils', name: 'Приборы', icon: '🍴' },
  { id: 'tray', name: 'Поднос', icon: '🍱' },
  { id: 'other', name: 'Другое', icon: '❓' },
]

interface CorrectDish {
  Count: number
  Dishes: Array<{
    Name: string
    product_name?: string
    ean?: string
    proto_name?: string | null
    ExternalId?: string
  }>
}

interface Recognition {
  id: number
  recognition_id: string
  recognition_date: string
  workflow_state: string
  is_mistake: boolean
  correct_dishes: CorrectDish[]
  annotator_notes: string | null
  has_modifications: boolean
}

interface MenuItem {
  id: string
  proto_name: string
  ean?: string
  product_name: string
  english_name?: string
}

export default function AnnotationPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const recognitionId = resolvedParams.id
  const router = useRouter()

  const [recognition, setRecognition] = useState<Recognition | null>(null)
  const [menuAll, setMenuAll] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  const { images, createAnnotation, updateAnnotation, deleteAnnotation, updateAnnotationLocally, setLocalImages } = useAnnotations([])

  // UI state
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
  const [drawingMode, setDrawingMode] = useState(false)
  const [showAllBBoxes, setShowAllBBoxes] = useState(true)
  const [highlightedDishIndex, setHighlightedDishIndex] = useState<number | null>(null)
  const [highlightedPlate, setHighlightedPlate] = useState(false)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [selectedBBoxIndexInDish, setSelectedBBoxIndexInDish] = useState(0)

  // Popup state
  const [pendingBBox, setPendingBBox] = useState<{
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
    image_id: number
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'check' | 'nonfood' | 'plate' | 'buzzer'>('check')
  const [menuSearch, setMenuSearch] = useState('')
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Derived state
  const mainImage = useMemo(() => images?.find((img: Image) => img.photo_type === 'Main'), [images])
  const qualifyingImage = useMemo(() => images?.find((img: Image) => img.photo_type === 'Qualifying'), [images])

  const mainPlatesCount = useMemo(
    () => mainImage?.annotations.filter((a) => a.object_type === 'plate').length || 0,
    [mainImage]
  )
  const qualPlatesCount = useMemo(
    () => qualifyingImage?.annotations.filter((a) => a.object_type === 'plate').length || 0,
    [qualifyingImage]
  )

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch(`/api/annotations/recognitions/${recognitionId}`)
        if (!response.ok) throw new Error('Failed to load recognition')

        const data = await response.json()
        setRecognition(data.recognition)
        setMenuAll(data.menu_all || [])

        // Initialize images через useAnnotations
        if (data.images) {
          const imagesWithAnnotations = data.images.map((img: Image) => ({
            ...img,
            annotations: img.annotations || [],
          }))
          setLocalImages(imagesWithAnnotations)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [recognitionId])

  // Handlers
  const handleDishClick = (dishIndex: number) => {
    if (highlightedDishIndex === dishIndex) {
      // Cycle through bboxes for this dish
      const mainBboxes = mainImage?.annotations.filter((a) => a.dish_index === dishIndex) || []
      const qualBboxes = qualifyingImage?.annotations.filter((a) => a.dish_index === dishIndex) || []
      const allBboxes = [...mainBboxes, ...qualBboxes]

      if (allBboxes.length > 1) {
        const nextIndex = (selectedBBoxIndexInDish + 1) % allBboxes.length
        setSelectedBBoxIndexInDish(nextIndex)
        setSelectedAnnotation(allBboxes[nextIndex])
      }
    } else {
      setHighlightedDishIndex(dishIndex)
      setHighlightedPlate(false)
      setSelectedBBoxIndexInDish(0)
      setShowAllBBoxes(false)

      // Select first bbox for this dish
      const mainBboxes = mainImage?.annotations.filter((a) => a.dish_index === dishIndex) || []
      const qualBboxes = qualifyingImage?.annotations.filter((a) => a.dish_index === dishIndex) || []
      const allBboxes = [...mainBboxes, ...qualBboxes]
      if (allBboxes.length > 0) {
        setSelectedAnnotation(allBboxes[0])
      }
    }
  }

  const handlePlateClick = () => {
    if (mainPlatesCount === 0 && qualPlatesCount === 0) return

    setHighlightedDishIndex(-1)
    setHighlightedPlate(true)
    setShowAllBBoxes(false)

    const mainPlates = mainImage?.annotations.filter((a) => a.object_type === 'plate') || []
    const qualPlates = qualifyingImage?.annotations.filter((a) => a.object_type === 'plate') || []
    const allPlates = [...mainPlates, ...qualPlates]
    if (allPlates.length > 0) {
      setSelectedAnnotation(allPlates[0])
    }
  }

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

  const finishAnnotationCreate = async (
    objectType: string,
    objectSubtype: string | null,
    dishIndex: number | null,
    isError: boolean = false
  ) => {
    if (!pendingBBox) {
      console.error('[AnnotationPage] finishAnnotationCreate called but pendingBBox is null')
      return
    }

    console.log('[AnnotationPage] Creating annotation:', {
      objectType,
      objectSubtype,
      dishIndex,
      pendingBBox,
    })

    const result = await createAnnotation({
      image_id: pendingBBox.image_id,
      object_type: objectType,
      object_subtype: objectSubtype,
      dish_index: dishIndex,
      bbox_x1: pendingBBox.bbox_x1,
      bbox_y1: pendingBBox.bbox_y1,
      bbox_x2: pendingBBox.bbox_x2,
      bbox_y2: pendingBBox.bbox_y2,
      is_overlapped: false,
      is_bottle_up: null,
      is_error: isError,
    })

    console.log('[AnnotationPage] Annotation created:', result)

    setPendingBBox(null)
    setMenuSearch('')
    setActiveTab('check')
    setModalPosition({ x: 0, y: 0 })
    setDrawingMode(false)
  }

  const handleVariantSelect = async (dishIndex: number, variantIndex: number) => {
    // Update all bboxes for this dish with selected_dish_variant_index
    const mainBboxes = mainImage?.annotations.filter((a) => a.dish_index === dishIndex) || []
    const qualBboxes = qualifyingImage?.annotations.filter((a) => a.dish_index === dishIndex) || []

    for (const bbox of [...mainBboxes, ...qualBboxes]) {
      await updateAnnotation(bbox.id, { selected_dish_variant_index: variantIndex })
    }
  }

  const handleModalMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y,
    })
  }
  
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
        setModalPosition({
          x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
        })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  // Hotkeys
  useHotkeys([
    {
      key: 'h',
      handler: () => setShowAllBBoxes((prev) => !prev),
    },
    {
      key: 'd',
      handler: () => setDrawingMode((prev) => !prev),
    },
    {
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        setActiveImage((prev) => (prev === 'Main' ? 'Qualifying' : 'Main'))
      },
    },
    {
      key: 'Delete',
      handler: () => {
        if (selectedAnnotation && selectedAnnotation.id !== -1) {
          deleteAnnotation(selectedAnnotation.id)
          setSelectedAnnotation(null)
        }
      },
    },
    {
      key: 'Escape',
      handler: () => {
          setPendingBBox(null)
          setDrawingMode(false)
      },
    },
    {
      key: '1',
      handler: () => {
        if (pendingBBox) {
          finishAnnotationCreate('plate', null, null, false)
        } else if (mainPlatesCount > 0 || qualPlatesCount > 0) {
          handlePlateClick()
      }
    },
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      key: String(i + 2),
      handler: () => {
        if (pendingBBox) {
          finishAnnotationCreate('food', null, i, false)
        } else {
          handleDishClick(i)
        }
      },
    })),
    {
      key: 'ArrowLeft',
      handler: () => {
        // Navigate through all items (plates + dishes)
        const totalPlates = mainPlatesCount > 0 || qualPlatesCount > 0 ? 1 : 0
        const totalDishes = recognition?.correct_dishes.length || 0
        const totalItems = totalPlates + totalDishes

        if (totalItems === 0) return

        let currentIndex = highlightedPlate ? 0 : (highlightedDishIndex ?? -1) + 1
        currentIndex = (currentIndex - 1 + totalItems) % totalItems

        if (currentIndex === 0 && totalPlates > 0) {
          handlePlateClick()
        } else {
          handleDishClick(currentIndex - totalPlates)
        }
      },
    },
    {
      key: 'ArrowRight',
      handler: () => {
        const totalPlates = mainPlatesCount > 0 || qualPlatesCount > 0 ? 1 : 0
        const totalDishes = recognition?.correct_dishes.length || 0
        const totalItems = totalPlates + totalDishes

        if (totalItems === 0) return

        let currentIndex = highlightedPlate ? 0 : (highlightedDishIndex ?? -1) + 1
        currentIndex = (currentIndex + 1) % totalItems

        if (currentIndex === 0 && totalPlates > 0) {
          handlePlateClick()
        } else {
          handleDishClick(currentIndex - totalPlates)
        }
      },
    },
  ])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка...</div>
      </div>
    )
  }

  if (!recognition) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-red-600">Ошибка загрузки recognition</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/annotations')}>
              ← Назад
            </Button>
            <h1 className="text-2xl font-bold">Recognition {recognitionId}</h1>
            {recognition.has_modifications && (
              <Badge variant="default" className="bg-orange-500">
                Изменено
              </Badge>
              )}
            </div>
            
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              🍽️ Тарелки: <span className={mainPlatesCount === qualPlatesCount ? 'text-green-600' : 'text-red-600'}>
                {mainPlatesCount} & {qualPlatesCount}
              </span>
            </span>
            <Button onClick={() => router.push('/annotations')}>
              ✓ Готово
            </Button>
          </div>
          </div>
        </div>

      {/* Hotkeys hint */}
      <div className="bg-blue-50 border-b px-6 py-2 text-sm text-gray-700">
        <strong>Hotkeys:</strong> H - показать все bbox | D - рисовать | Del/Bksp - удалить | 1 - тарелки | 2-9 - блюда | ← → - навигация | Tab - переключить изображение | Esc - сброс
          </div>

      <div className="flex h-[calc(100vh-180px)]">
        {/* Left Panel - DishList */}
        <div className="w-96 bg-white border-r p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Объекты на изображении</h2>

          <DishList
            dishes={recognition.correct_dishes}
            images={images}
            onDishClick={handleDishClick}
            onPlateClick={handlePlateClick}
            onVariantSelect={handleVariantSelect}
            onAnnotationUpdate={updateAnnotation}
            onAnnotationDelete={deleteAnnotation}
            highlightedIndex={highlightedDishIndex}
            highlightedPlate={highlightedPlate}
            showControls={true}
            className="max-h-full overflow-y-auto pr-2"
          />
        </div>

        {/* Center - Images */}
        <div className="flex-1 p-4">
          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between bg-white rounded-lg shadow-sm px-4 py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">
                Активное: <Badge variant="default">{activeImage}</Badge>
                            </span>
              <span className="text-xs text-gray-500">(Tab для переключения)</span>
                      </div>
                      
            <Button
              variant={drawingMode ? 'default' : 'outline'}
              onClick={() => setDrawingMode(!drawingMode)}
            >
              {drawingMode ? '✓ Режим рисования' : 'Нарисовать bbox'}
            </Button>
                        </div>

          {/* Two images side by side */}
          <div className="grid grid-cols-2 gap-4 h-[calc(100%-80px)]">
            {/* Main Image */}
            <div>
              <div className="text-center text-sm font-semibold mb-2 text-gray-700">
                Main (45°) {activeImage === 'Main' && <Badge variant="default" className="ml-2">Активно</Badge>}
              </div>
              <div
                className="h-full rounded overflow-hidden border-2 cursor-pointer"
                style={{ borderColor: activeImage === 'Main' ? '#3b82f6' : '#e5e7eb' }}
                onClick={() => setActiveImage('Main')}
              >
                {mainImage && (
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${mainImage.storage_path}`}
                    annotations={
                      !showAllBBoxes && selectedAnnotation
                        ? selectedAnnotation.dish_index !== null
                          ? mainImage.annotations.filter((ann) => ann.dish_index === selectedAnnotation.dish_index)
                          : mainImage.annotations.filter((ann) => ann.object_type === 'plate')
                        : !showAllBBoxes && highlightedDishIndex !== null
                        ? highlightedDishIndex === -1
                          ? mainImage.annotations.filter((ann) => ann.object_type === 'plate')
                          : mainImage.annotations.filter((ann) => ann.dish_index === highlightedDishIndex)
                        : !showAllBBoxes && highlightedPlate
                        ? mainImage.annotations.filter((ann) => ann.object_type === 'plate')
                        : mainImage.annotations
                    }
                    originalAnnotations={mainImage.original_annotations}
                    imageId={mainImage.id}
                    highlightDishIndex={highlightedDishIndex}
                    onAnnotationCreate={activeImage === 'Main' ? (bbox) => handleAnnotationCreate(mainImage.id, bbox) : undefined}
                    onAnnotationUpdate={updateAnnotation}
                    onAnnotationSelect={setSelectedAnnotation}
                    selectedAnnotation={selectedAnnotation}
                    drawingMode={activeImage === 'Main' && drawingMode}
                    readOnly={false}
                    showControls={true}
                    updateAnnotationLocally={updateAnnotationLocally}
                    referenceWidth={1810}
                    referenceHeight={1080}
                  />
                )}
                </div>
              </div>

            {/* Qualifying Image */}
                <div>
              <div className="text-center text-sm font-semibold mb-2 text-gray-700">
                Qualifying (90°) {activeImage === 'Qualifying' && <Badge variant="default" className="ml-2">Активно</Badge>}
              </div>
              <div
                className="h-full rounded overflow-hidden border-2 cursor-pointer"
                style={{ borderColor: activeImage === 'Qualifying' ? '#3b82f6' : '#e5e7eb' }}
                onClick={() => setActiveImage('Qualifying')}
              >
                {qualifyingImage && (
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${qualifyingImage.storage_path}`}
                    annotations={
                      !showAllBBoxes && selectedAnnotation
                        ? selectedAnnotation.dish_index !== null
                          ? qualifyingImage.annotations.filter((ann) => ann.dish_index === selectedAnnotation.dish_index)
                          : qualifyingImage.annotations.filter((ann) => ann.object_type === 'plate')
                        : !showAllBBoxes && highlightedDishIndex !== null
                        ? highlightedDishIndex === -1
                          ? qualifyingImage.annotations.filter((ann) => ann.object_type === 'plate')
                          : qualifyingImage.annotations.filter((ann) => ann.dish_index === highlightedDishIndex)
                        : !showAllBBoxes && highlightedPlate
                        ? qualifyingImage.annotations.filter((ann) => ann.object_type === 'plate')
                        : qualifyingImage.annotations
                    }
                    originalAnnotations={qualifyingImage.original_annotations}
                    imageId={qualifyingImage.id}
                    highlightDishIndex={highlightedDishIndex}
                    onAnnotationCreate={activeImage === 'Qualifying' ? (bbox) => handleAnnotationCreate(qualifyingImage.id, bbox) : undefined}
                    onAnnotationUpdate={updateAnnotation}
                    onAnnotationSelect={setSelectedAnnotation}
                    selectedAnnotation={selectedAnnotation}
                    drawingMode={activeImage === 'Qualifying' && drawingMode}
                    readOnly={false}
                    showControls={true}
                    updateAnnotationLocally={updateAnnotationLocally}
                    referenceWidth={1410}
                    referenceHeight={1080}
                  />
                )}
                </div>
                </div>
          </div>
          </div>
        </div>

      {/* Draggable popup for annotation creation */}
      {pendingBBox && (() => {
            const dropdownWidth = 500
            const dropdownHeight = 600
            
              const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
              const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
              
            const left = modalPosition.x || Math.max(20, (screenWidth - dropdownWidth) / 2)
            const top = modalPosition.y || Math.max(20, (screenHeight - dropdownHeight) / 2)
            
            if (modalPosition.x === 0 && modalPosition.y === 0) {
              setTimeout(() => {
                setModalPosition({
                  x: Math.max(20, (screenWidth - dropdownWidth) / 2),
              y: Math.max(20, (screenHeight - dropdownHeight) / 2),
                })
              }, 0)
            }
            
            return (
              <div 
                className="fixed bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col"
                style={{ 
                  left: `${left}px`, 
                  top: `${top}px`,
                  width: `${dropdownWidth}px`,
                  height: `${dropdownHeight}px`,
              zIndex: 100,
                }}
              >
                {/* Header - Draggable */}
                <div 
                  className="p-3 border-b bg-white flex-shrink-0 cursor-move select-none"
                  onMouseDown={handleModalMouseDown}
                >
                  <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Что вы добавили?</h3>
                    <button
                      className="text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setPendingBBox(null)
                        setMenuSearch('')
                        setActiveTab('check')
                    setModalPosition({ x: 0, y: 0 })
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              
            {/* Tabs */}
                <div className="flex border-b bg-gray-50 flex-shrink-0">
                  <button
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'check' 
                        ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => setActiveTab('check')}
                  >
                    📋 Из чека
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'nonfood'
                        ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                onClick={() => setActiveTab('nonfood')}
                  >
                📦 Предметы
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'plate'
                        ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                onClick={() => setActiveTab('plate')}
              >
                🍽️ Тарелки
              </button>
              <button
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'buzzer'
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('buzzer')}
              >
                🔔 Баззер
                  </button>
                </div>
              
                <div className="flex-1 overflow-y-auto p-4">
              {/* Tab: Check */}
                  {activeTab === 'check' && (
                    <div className="space-y-2">
                  {recognition.correct_dishes.map((dish, index) => {
                    const allDishes = dish.Dishes || []
                    const displayName = allDishes[0]?.Name || allDishes[0]?.product_name || 'Unknown'
                    const hasMultiple = allDishes.length > 1

                    return (
                      <div key={index} className="border rounded p-3 bg-gray-50">
                        <button
                          className="w-full text-left hover:bg-blue-50 transition-colors p-2 rounded"
                          onClick={() => finishAnnotationCreate('food', null, index, false)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">#{index + 1}</span>
                            <span className="text-gray-900">{displayName}</span>
                            {hasMultiple && (
                              <span className="text-xs text-orange-600">[{allDishes.length} вар.]</span>
                            )}
                          </div>
                        </button>

                        {hasMultiple && (
                          <div className="mt-2 ml-4 space-y-1">
                            {allDishes.map((variant, varIdx) => (
                          <button
                                key={varIdx}
                                className="w-full text-left px-3 py-1 hover:bg-blue-50 transition-colors text-sm rounded"
                                onClick={() => finishAnnotationCreate('food', null, index, false)}
                              >
                                • {variant.Name || variant.product_name}
                          </button>
                            ))}
                      </div>
                      )}
                    </div>
                    )
                  })}
                    </div>
                  )}

              {/* Tab: Non-food */}
                  {activeTab === 'nonfood' && (
                    <div className="space-y-2">
                      {NON_FOOD_OBJECTS.map((obj) => (
                          <button
                          key={obj.id}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                      onClick={() => finishAnnotationCreate('non_food', obj.id, null, false)}
                    >
                      <span className="text-2xl">{obj.icon}</span>
                      <span className="text-gray-900">{obj.name}</span>
                          </button>
                        ))}
                      </div>
                  )}

              {/* Tab: Plate */}
              {activeTab === 'plate' && (
                <div className="space-y-2">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                    onClick={() => finishAnnotationCreate('plate', null, null, false)}
                  >
                    <span className="text-2xl">🍽️</span>
                    <span className="text-gray-900">Тарелка</span>
                  </button>
                </div>
              )}

              {/* Tab: Buzzer */}
              {activeTab === 'buzzer' && (
                <div className="space-y-2">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                    onClick={() => finishAnnotationCreate('buzzer', null, null, false)}
                  >
                    <span className="text-2xl">🔔</span>
                    <span className="text-gray-900">Баззер</span>
                  </button>
              </div>
        )}
      </div>
          </div>
        )
      })()}
    </div>
  )
}
