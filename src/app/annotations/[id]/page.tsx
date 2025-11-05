'use client'

import { useEffect, useState, use, useRef, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHotkeys } from '@/hooks/useHotkeys'
import { AlertOctagon } from 'lucide-react'
import { AnnotationControls } from '@/components/AnnotationControls'

// Динамический импорт компонента с Konva (не работает с SSR)
const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

interface Annotation {
  id: number
  image_id: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  object_type: string
  object_subtype: string | null
  dish_index: number | null
  is_overlapped: boolean
  is_bottle_up: boolean | null
  is_error: boolean
  source: string
  qwen_detection_index?: number | null
  qwen_detection_type?: string | null
}

interface RecognitionImage {
  id: number
  recognition_id: string
  photo_type: string
  storage_path: string
  image_width: number | null
  image_height: number | null
  original_annotations?: any | null
  annotations: Annotation[]
}

interface Recognition {
  id: number
  recognition_id: string
  recognition_date: string
  status: string
  is_mistake: boolean
  correct_dishes: any[]
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

// История изменений для Undo/Redo
interface HistorySnapshot {
  images: RecognitionImage[]
  recognition: Recognition
  selectedAnnotation: Annotation | null
}

// Централизованное состояние приложения
interface AppState {
  images: RecognitionImage[]
  recognition: Recognition | null
  selectedAnnotation: Annotation | null
  history: HistorySnapshot[]
  historyIndex: number
}

// Типы действий для reducer
type AnnotationAction =
  | { type: 'INIT_DATA'; payload: { images: RecognitionImage[]; recognition: Recognition; menuAll: MenuItem[] } }
  | { type: 'CREATE_ANNOTATION'; payload: { annotation: Annotation; imageId: number } }
  | { type: 'UPDATE_ANNOTATION'; payload: { id: number; updates: Partial<Annotation> } }
  | { type: 'DELETE_ANNOTATION'; payload: { id: number } }
  | { type: 'UPDATE_STATUS'; payload: { status: string } }
  | { type: 'SET_SELECTED'; payload: { annotation: Annotation | null } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESTORE_ORIGINAL' }

// Non-food объекты (hardcoded)
const NON_FOOD_OBJECTS = [
  { id: 'hand', name: 'Рука', icon: '✋' },
  { id: 'phone', name: 'Телефон', icon: '📱' },
  { id: 'wallet', name: 'Кошелек', icon: '👛' },
  { id: 'cards', name: 'Карты', icon: '💳' },
  { id: 'cutlery', name: 'Столовые приборы', icon: '🍴' },
  { id: 'other', name: 'Другое', icon: '📦' }
]

// Цвета для блюд
const DISH_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16'
]

// Максимальный размер истории
const MAX_HISTORY = 50

// Вспомогательная функция для создания snapshot
function createHistorySnapshot(state: AppState): HistorySnapshot {
  return {
    images: JSON.parse(JSON.stringify(state.images)),
    recognition: JSON.parse(JSON.stringify(state.recognition)),
    selectedAnnotation: state.selectedAnnotation ? JSON.parse(JSON.stringify(state.selectedAnnotation)) : null
  }
}

// Вспомогательная функция для вычисления has_modifications
function calculateHasModifications(currentImages: RecognitionImage[], originalSnapshot: HistorySnapshot): boolean {
  if (!originalSnapshot) return false
  
  const currentAnnotations = currentImages.flatMap(img => img.annotations).map(a => ({
    id: a.id,
    bbox_x1: a.bbox_x1,
    bbox_y1: a.bbox_y1,
    bbox_x2: a.bbox_x2,
    bbox_y2: a.bbox_y2,
    object_type: a.object_type,
    object_subtype: a.object_subtype,
    dish_index: a.dish_index,
    is_overlapped: a.is_overlapped,
    is_bottle_up: a.is_bottle_up,
    is_error: a.is_error
  }))
  
  const originalAnnotations = originalSnapshot.images.flatMap(img => img.annotations).map(a => ({
    id: a.id,
    bbox_x1: a.bbox_x1,
    bbox_y1: a.bbox_y1,
    bbox_x2: a.bbox_x2,
    bbox_y2: a.bbox_y2,
    object_type: a.object_type,
    object_subtype: a.object_subtype,
    dish_index: a.dish_index,
    is_overlapped: a.is_overlapped,
    is_bottle_up: a.is_bottle_up,
    is_error: a.is_error
  }))
  
  return JSON.stringify(currentAnnotations) !== JSON.stringify(originalAnnotations)
}

// Reducer для централизованного управления состоянием
function annotationReducer(state: AppState, action: AnnotationAction): AppState {
  switch (action.type) {
    case 'INIT_DATA': {
      const { images, recognition } = action.payload
      const initialSnapshot: HistorySnapshot = {
        images: JSON.parse(JSON.stringify(images)),
        recognition: JSON.parse(JSON.stringify(recognition)),
        selectedAnnotation: null
      }
      return {
        images,
        recognition,
        selectedAnnotation: null,
        history: [initialSnapshot],
        historyIndex: 0
      }
    }

    case 'CREATE_ANNOTATION': {
      const { annotation, imageId } = action.payload
      
      // Обновляем images - добавляем новую аннотацию
      const newImages = state.images.map(img =>
        img.id === imageId
          ? { ...img, annotations: [...img.annotations, annotation] }
          : img
      )
      
      // Вычисляем has_modifications
      const hasModifications = calculateHasModifications(newImages, state.history[0])
      
      // Создаем новый snapshot
      const newState = {
        ...state,
        images: newImages,
        recognition: state.recognition ? { ...state.recognition, has_modifications: hasModifications } : null,
        selectedAnnotation: annotation
      }
      
      const snapshot = createHistorySnapshot(newState)
      
      // Обрезаем будущее если были undo
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(snapshot)
      
      // Ограничиваем размер истории
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
        return {
          ...newState,
          history: newHistory,
          historyIndex: newHistory.length - 1
        }
      }
      
      return {
        ...newState,
        history: newHistory,
        historyIndex: newHistory.length - 1
      }
    }

    case 'UPDATE_ANNOTATION': {
      const { id, updates } = action.payload
      
      // Обновляем annotation
      const newImages = state.images.map(img => ({
        ...img,
        annotations: img.annotations.map(ann =>
          ann.id === id ? { ...ann, ...updates } : ann
        )
      }))
      
      // Вычисляем has_modifications
      const hasModifications = calculateHasModifications(newImages, state.history[0])
      
      // Обновляем selectedAnnotation если это она
      const newSelectedAnnotation = state.selectedAnnotation?.id === id
        ? { ...state.selectedAnnotation, ...updates }
        : state.selectedAnnotation
      
      // Создаем новый snapshot
      const newState = {
        ...state,
        images: newImages,
        recognition: state.recognition ? { ...state.recognition, has_modifications: hasModifications } : null,
        selectedAnnotation: newSelectedAnnotation
      }
      
      const snapshot = createHistorySnapshot(newState)
      
      // Обрезаем будущее если были undo
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(snapshot)
      
      // Ограничиваем размер истории
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
        return {
          ...newState,
          history: newHistory,
          historyIndex: newHistory.length - 1
        }
      }
      
      return {
        ...newState,
        history: newHistory,
        historyIndex: newHistory.length - 1
      }
    }

    case 'DELETE_ANNOTATION': {
      const { id } = action.payload
      
      // Удаляем аннотацию
      const newImages = state.images.map(img => ({
        ...img,
        annotations: img.annotations.filter(ann => ann.id !== id)
      }))
      
      // Вычисляем has_modifications
      const hasModifications = calculateHasModifications(newImages, state.history[0])
      
      // Сбрасываем selectedAnnotation если удаляем её
      const newSelectedAnnotation = state.selectedAnnotation?.id === id ? null : state.selectedAnnotation
      
      // Создаем новый snapshot
      const newState = {
        ...state,
        images: newImages,
        recognition: state.recognition ? { ...state.recognition, has_modifications: hasModifications } : null,
        selectedAnnotation: newSelectedAnnotation
      }
      
      const snapshot = createHistorySnapshot(newState)
      
      // Обрезаем будущее если были undo
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(snapshot)
      
      // Ограничиваем размер истории
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
        return {
          ...newState,
          history: newHistory,
          historyIndex: newHistory.length - 1
        }
      }
      
      return {
        ...newState,
        history: newHistory,
        historyIndex: newHistory.length - 1
      }
    }

    case 'UPDATE_STATUS': {
      const { status } = action.payload
      return {
        ...state,
        recognition: state.recognition ? { ...state.recognition, status } : null
      }
    }

    case 'SET_SELECTED': {
      return {
        ...state,
        selectedAnnotation: action.payload.annotation
      }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      
      const newIndex = state.historyIndex - 1
      const snapshot = state.history[newIndex]
      
      return {
        ...state,
        images: JSON.parse(JSON.stringify(snapshot.images)),
        recognition: JSON.parse(JSON.stringify(snapshot.recognition)),
        selectedAnnotation: snapshot.selectedAnnotation ? JSON.parse(JSON.stringify(snapshot.selectedAnnotation)) : null,
        historyIndex: newIndex
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      
      const newIndex = state.historyIndex + 1
      const snapshot = state.history[newIndex]
      
      return {
        ...state,
        images: JSON.parse(JSON.stringify(snapshot.images)),
        recognition: JSON.parse(JSON.stringify(snapshot.recognition)),
        selectedAnnotation: snapshot.selectedAnnotation ? JSON.parse(JSON.stringify(snapshot.selectedAnnotation)) : null,
        historyIndex: newIndex
      }
    }

    case 'RESTORE_ORIGINAL': {
      // Восстанавливаем из первого snapshot
      if (state.history.length === 0) return state
      
      const originalSnapshot = state.history[0]
      
      return {
        ...state,
        images: JSON.parse(JSON.stringify(originalSnapshot.images)),
        recognition: JSON.parse(JSON.stringify(originalSnapshot.recognition)),
        selectedAnnotation: null,
        history: [originalSnapshot],
        historyIndex: 0
      }
    }

    default:
      return state
  }
}

export default function AnnotationEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  
  // Централизованное состояние через useReducer
  const initialState: AppState = {
    images: [],
    recognition: null,
    selectedAnnotation: null,
    history: [],
    historyIndex: -1
  }
  
  const [state, dispatch] = useReducer(annotationReducer, initialState)
  
  // Деструктурируем состояние для удобства
  const { images, recognition, selectedAnnotation, history, historyIndex } = state
  
  // Локальное состояние (не связанное с аннотациями)
  const [menuAll, setMenuAll] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drawingMode, setDrawingMode] = useState(false)
  const [currentPhotoType, setCurrentPhotoType] = useState<'Main' | 'Qualifying'>('Main')
  const [showOnlySelected, setShowOnlySelected] = useState(true) // Показывать только выбранные bbox
  const [pendingBBox, setPendingBBox] = useState<{bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number; image_id: number} | null>(null)
  const [changingDishFor, setChangingDishFor] = useState<number | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number; width: number; bboxWidth: number } | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'check' | 'menu' | 'nonfood'>('check')
  
  // Состояние для draggable модального окна
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // useRef для актуальных значений (для hotkeys)
  const imagesRef = useRef(images)
  const currentPhotoTypeRef = useRef(currentPhotoType)
  const selectedAnnotationRef = useRef(selectedAnnotation)
  
  useEffect(() => {
    imagesRef.current = images
    currentPhotoTypeRef.current = currentPhotoType
    selectedAnnotationRef.current = selectedAnnotation
  }, [images, currentPhotoType, selectedAnnotation])

  useEffect(() => {
    fetchRecognition()
  }, [resolvedParams.id])

  // Обработчики для draggable модального окна
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setModalPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleModalMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const modalEl = e.currentTarget.parentElement
    if (!modalEl) return
    
    const rect = modalEl.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
  }

  const fetchRecognition = async () => {
    try {
      const response = await fetch(`/api/annotations/recognitions/${resolvedParams.id}`)
      const data = await response.json()
      
      if (response.ok) {
        setMenuAll(data.menu_all || [])
        // Инициализируем состояние через reducer
        dispatch({
          type: 'INIT_DATA',
          payload: {
            images: data.images,
            recognition: data.recognition,
            menuAll: data.menu_all || []
          }
        })
      }
    } catch (error) {
      console.error('Error fetching recognition:', error)
    } finally {
      setLoading(false)
    }
  }

  // Функции для Undo/Redo (обертки над dispatch)
  const canUndo = () => historyIndex > 0
  const canRedo = () => historyIndex < history.length - 1

  const undo = () => {
    if (!canUndo()) return
    dispatch({ type: 'UNDO' })
    setShowOnlySelected(false)
  }

  const redo = () => {
    if (!canRedo()) return
    dispatch({ type: 'REDO' })
    setShowOnlySelected(false)
  }

  // Циклическое переключение между bbox одного блюда (упрощенная навигация)
  const selectNextBboxForDish = (dishIndex: number) => {
    setDrawingMode(false)
    setShowOnlySelected(true) // Включаем фильтрацию
    
    const img = imagesRef.current.find(i => i.photo_type === currentPhotoTypeRef.current)
    if (!img) return
    
    // Все bbox этого блюда (отсортированные по id)
    const dishAnnotations = img.annotations
      .filter(a => a.dish_index === dishIndex)
      .sort((a, b) => a.id - b.id)
    
    if (dishAnnotations.length === 0) return
    
    // Если уже выбран этот bbox этого блюда - переходим к следующему
    const currentAnn = selectedAnnotationRef.current
    if (currentAnn && currentAnn.dish_index === dishIndex) {
      const currentIndex = dishAnnotations.findIndex(a => a.id === currentAnn.id)
      if (currentIndex !== -1) {
        // Циклический переход к следующему
        const nextIndex = (currentIndex + 1) % dishAnnotations.length
        dispatch({ type: 'SET_SELECTED', payload: { annotation: dishAnnotations[nextIndex] } })
        return
      }
    }
    
    // Иначе выбираем первый bbox этого блюда
    dispatch({ type: 'SET_SELECTED', payload: { annotation: dishAnnotations[0] } })
  }
  
  // Горячие клавиши (упрощенные - без X0Y)
  useHotkeys([
    {
      key: 's',
      ctrl: true,
      handler: (e) => {
        e.preventDefault()
        handleStatusChange('completed')
      }
    },
    {
      key: 'z',
      ctrl: true,
      shift: false,
      handler: (e) => {
        e.preventDefault()
        undo()
      }
    },
    {
      key: 'z',
      ctrl: true,
      shift: true,
      handler: (e) => {
        e.preventDefault()
        redo()
      }
    },
    {
      key: 'Delete',
      handler: (e) => {
        e.preventDefault()
        if (selectedAnnotation) {
          handleAnnotationDelete()
        }
      }
    },
    {
      key: 'Backspace',
      handler: (e) => {
        e.preventDefault()
        if (selectedAnnotation) {
          handleAnnotationDelete()
        }
      }
    },
    {
      key: 'Escape',
      handler: () => {
        // Если есть pendingBBox - отменяем его
        if (pendingBBox) {
          setPendingBBox(null)
          setDropdownPosition(null)
          setMenuSearch('')
          setDrawingMode(false)
          setShowOnlySelected(false)
          setModalPosition({ x: 0, y: 0 }) // Сбрасываем позицию
          return
        }
        
        setDrawingMode(false)
        dispatch({ type: 'SET_SELECTED', payload: { annotation: null } })
        setShowOnlySelected(false) // Показываем все bbox
        setChangingDishFor(null)
        setDropdownPosition(null)
        setModalPosition({ x: 0, y: 0 }) // Сбрасываем позицию
      }
    },
    {
      key: 'h',
      handler: () => {
        setShowOnlySelected(!showOnlySelected)
      }
    },
    {
      key: 'd',
      handler: () => {
        const newDrawingMode = !drawingMode
        setDrawingMode(newDrawingMode)
        if (newDrawingMode) {
          // При включении рисования - сбрасываем выделение
          dispatch({ type: 'SET_SELECTED', payload: { annotation: null } })
          setShowOnlySelected(true) // Фильтрация включена, но ничего не выбрано = пустой экран
        }
      }
    },
    // Цифры 1-9 для выбора блюд (циклическая навигация)
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      handler: () => selectNextBboxForDish(i)
    }))
  ])

  const handleAnnotationCreate = async (imageId: number, bbox: any) => {
    // Показываем dropdown для выбора типа объекта
    setPendingBBox({ ...bbox, image_id: imageId })
    // НЕ выключаем drawingMode - оставляем экран чистым до выбора типа
  }

  const finishAnnotationCreate = async (objectType: string, objectSubtype: string | null, dishIndex: number | null, isError: boolean = false) => {
    if (!pendingBBox) return
    
    try {
      const response = await fetch('/api/annotations/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          is_error: isError
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error('Failed to create annotation')
      }

      const newAnnotation = result.data

      // Dispatch для создания аннотации (автоматически создаст snapshot)
      dispatch({
        type: 'CREATE_ANNOTATION',
        payload: {
          annotation: newAnnotation,
          imageId: pendingBBox.image_id
        }
      })

      setPendingBBox(null)
      setDropdownPosition(null)
      setMenuSearch('')
      setDrawingMode(false) // Выключаем режим рисования после создания
      setShowOnlySelected(true)
    } catch (error) {
      console.error('Error creating annotation:', error)
    }
  }

  const changeDishForAnnotation = async (objectType: string, objectSubtype: string | null, dishIndex: number | null, isError: boolean = false) => {
    if (changingDishFor === null) return
    
    try {
      const response = await fetch(`/api/annotations/annotations/${changingDishFor}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object_type: objectType,
          object_subtype: objectSubtype,
          dish_index: dishIndex,
          is_error: isError
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update annotation')
      }

      // Dispatch для обновления аннотации (автоматически создаст snapshot)
      dispatch({
        type: 'UPDATE_ANNOTATION',
        payload: {
          id: changingDishFor,
          updates: {
            object_type: objectType,
            object_subtype: objectSubtype,
            dish_index: dishIndex,
            is_error: isError
          }
        }
      })

      setChangingDishFor(null)
      setDropdownPosition(null)
      setMenuSearch('')
      setDrawingMode(false) // Выключаем режим рисования если был активен
    } catch (error) {
      console.error('Error changing dish:', error)
    }
  }

  const handleAnnotationUpdate = async (id: number, updates: any) => {
    // Игнорируем виртуальную аннотацию (pendingBBox)
    if (id === -1) return
    
    try {
      const annotation = images
        .flatMap(img => img.annotations)
        .find(a => a.id === id)

      if (!annotation) return

      // Автоматически ставим "в работе"
      if (recognition && recognition.status !== 'completed' && recognition.status !== 'in_progress') {
        handleStatusChange('in_progress')
      }

      // Dispatch для обновления аннотации (автоматически создаст snapshot)
      dispatch({
        type: 'UPDATE_ANNOTATION',
        payload: { id, updates }
      })

      // Отправляем на сервер в фоне
      fetch(`/api/annotations/annotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          current_bbox_x1: annotation.bbox_x1,
          current_bbox_y1: annotation.bbox_y1,
          current_bbox_x2: annotation.bbox_x2,
          current_bbox_y2: annotation.bbox_y2
        })
      }).catch(error => {
        console.error('Error updating annotation:', error)
        // В случае ошибки перезагружаем данные
        fetchRecognition()
      })
    } catch (error) {
      console.error('Error updating annotation:', error)
      await fetchRecognition()
    }
  }

  const handleAnnotationDelete = async (annotationId?: number) => {
    // Игнорируем виртуальную аннотацию (pendingBBox)
    if (annotationId === -1) return
    
    const annToDelete = annotationId !== undefined 
      ? images.flatMap(img => img.annotations).find(a => a.id === annotationId)
      : selectedAnnotation

    if (!annToDelete || annToDelete.id === -1) return

    try {
      // Автоматически ставим "в работе"
      if (recognition && recognition.status !== 'completed' && recognition.status !== 'in_progress') {
        handleStatusChange('in_progress')
      }

      const response = await fetch(`/api/annotations/annotations/${annToDelete.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete annotation')
      }

      // Если удаляем выбранную аннотацию - попробуем выбрать следующий bbox того же блюда
      if (selectedAnnotation?.id === annToDelete.id && annToDelete.dish_index !== null) {
        const img = images.find(i => i.photo_type === currentPhotoType)
        if (img) {
          const dishAnnotations = img.annotations
            .filter(a => a.dish_index === annToDelete.dish_index && a.id !== annToDelete.id)
            .sort((a, b) => a.id - b.id)
          
          if (dishAnnotations.length > 0) {
            dispatch({ type: 'SET_SELECTED', payload: { annotation: dishAnnotations[0] } })
          }
        }
      }

      // Dispatch для удаления аннотации (автоматически создаст snapshot)
      dispatch({
        type: 'DELETE_ANNOTATION',
        payload: { id: annToDelete.id }
      })
    } catch (error) {
      console.error('Error deleting annotation:', error)
    }
  }

  const handleToggleError = async (annotationId: number, isError: boolean) => {
    try {
      await handleAnnotationUpdate(annotationId, { is_error: isError })
    } catch (error) {
      console.error('Error toggling error status:', error)
    }
  }

  const handleRecognitionRestore = async () => {
    if (!confirm('Вы уверены? Это удалит все изменения и восстановит оригинальные QWEN аннотации.')) {
      return
    }

    try {
      const response = await fetch(`/api/annotations/recognitions/${resolvedParams.id}/restore`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to restore recognition')
      }

      // Сбрасываем UI состояние
      setShowOnlySelected(false)
      setDrawingMode(false)
      setChangingDishFor(null)
      
      // Перезагружаем данные с сервера
      await fetchRecognition()
    } catch (error) {
      console.error('Error restoring recognition:', error)
      alert('Ошибка при восстановлении recognition')
    }
  }

  const handleStatusChange = async (status: string) => {
    try {
      const response = await fetch(`/api/annotations/recognitions/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      // Dispatch для обновления статуса (без snapshot)
      dispatch({
        type: 'UPDATE_STATUS',
        payload: { status }
      })
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const getCurrentImage = () => {
    return images.find(img => img.photo_type === currentPhotoType)
  }

  const getDishAnnotationCount = (dishIndex: number) => {
    const currentImage = getCurrentImage()
    if (!currentImage) return 0
    return currentImage.annotations.filter(a => a.dish_index === dishIndex).length
  }

  const getDishNames = () => {
    const names: Record<number, string> = {}
    if (!recognition) return names
    recognition.correct_dishes.forEach((dish: any, index: number) => {
      names[index] = dish.Dishes?.[0]?.Name || 'Unknown'
    })
    return names
  }
  
  const getDishColor = (index: number) => {
    return DISH_COLORS[index % DISH_COLORS.length]
  }

  // Получить все bbox текущего изображения сгруппированные по типу
  const getGroupedAnnotations = () => {
    const currentImage = getCurrentImage()
    if (!currentImage) return { dishes: [], nonFood: [] }

    const dishes: { [key: number]: Annotation[] } = {}
    const nonFood: Annotation[] = []

    currentImage.annotations.forEach(ann => {
      if (ann.object_type === 'non_food') {
        nonFood.push(ann)
      } else if (ann.dish_index !== null) {
        if (!dishes[ann.dish_index]) {
          dishes[ann.dish_index] = []
        }
        dishes[ann.dish_index].push(ann)
      }
    })

    return { dishes, nonFood }
  }

  // Поиск в menu_all
  const searchMenuAll = (query: string) => {
    // Если данные пустые - показываем сообщение
    if (!menuAll || menuAll.length === 0) {
      return []
    }

    if (!query.trim()) return menuAll.slice(0, 50)

    const lowerQuery = query.toLowerCase()
    
    // Точное совпадение по ExternalId (EAN)
    const isNumeric = /^\d+$/.test(query)
    if (isNumeric) {
      const exactMatch = menuAll.filter((item: any) => item.ExternalId === query)
      if (exactMatch.length > 0) return exactMatch
    }

    // Fuzzy поиск по имени и ProtoNames
    return menuAll
      .filter((item: any) => {
        const name = item.Name?.toLowerCase() || ''
        const protoNames = Array.isArray(item.ProtoNames) 
          ? item.ProtoNames.join(' ').toLowerCase() 
          : ''
        return name.includes(lowerQuery) || protoNames.includes(lowerQuery)
      })
      .slice(0, 50)
  }

  // Фильтрация bbox для отображения
  const getFilteredAnnotations = (annotations: Annotation[]) => {
    // В режиме рисования (когда пользователь тащит мышь) - не показываем другие bbox
    if (drawingMode && !pendingBBox) {
      return []
    }

    // Если есть pendingBBox (только что нарисовали) - показываем ТОЛЬКО его как виртуальную аннотацию
    if (pendingBBox) {
      const virtualAnnotation: Annotation = {
        id: -1, // Временный ID
        image_id: pendingBBox.image_id,
        bbox_x1: pendingBBox.bbox_x1,
        bbox_y1: pendingBBox.bbox_y1,
        bbox_x2: pendingBBox.bbox_x2,
        bbox_y2: pendingBBox.bbox_y2,
        object_type: 'pending',
        object_subtype: null,
        dish_index: null,
        is_overlapped: false,
        is_bottle_up: null,
        is_error: false,
        source: 'manual'
      }
      return [virtualAnnotation]
    }

    // Если ничего не выбрано или фильтр отключен - показываем все
    if (!showOnlySelected || !selectedAnnotation) {
      return annotations
    }

    // Показываем только выбранный bbox
      return annotations.filter(a => a.id === selectedAnnotation.id)
    }

  // Определяем платформу для правильных подсказок
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modKey = isMac ? 'Cmd' : 'Ctrl'

  // Динамический hint для hotkeys
  const getHotkeyHint = () => {
    const undoRedo = `${modKey}+Z - отменить • ${modKey}+Shift+Z - вернуть`
    
    if (drawingMode) {
      return `Рисуйте bbox • Esc - отмена • ${undoRedo}`
    }
    
    if (selectedAnnotation) {
      const dishNum = selectedAnnotation.dish_index !== null ? selectedAnnotation.dish_index + 1 : null
      if (dishNum) {
        return `${dishNum} - след. bbox • Del/Bksp - удалить • H - показать все • Esc - сброс • ${undoRedo}`
      }
      return `Del/Bksp - удалить • H - показать все • Esc - сброс • ${undoRedo}`
    }
    
    return `1-9 - выбор блюда • 2,2,2 - перебор bbox • D - рисовать • H - показать/скрыть • Del/Bksp - удалить • Esc - сброс • ${undoRedo}`
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Загрузка...</div>
  }

  if (!recognition) {
    return <div className="min-h-screen flex items-center justify-center">Recognition не найден</div>
  }

  const currentImage = getCurrentImage()
  const { dishes, nonFood } = getGroupedAnnotations()

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1920px] mx-auto">
        {/* Header с статусом */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                Recognition {recognition.recognition_id}
              </h1>
              {recognition.is_mistake && (
                <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded">
                  <AlertOctagon className="w-4 h-4" />
                  <span className="text-sm font-medium">Ошибка</span>
                </div>
              )}
              {recognition.has_modifications && (
                <Badge className="bg-orange-500">Изменено</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600">
              {new Date(recognition.recognition_date).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-gray-600">Статус: </span>
              <span className="font-semibold">
                {recognition.status === 'completed' ? '✓ Завершено' :
                 recognition.status === 'in_progress' ? '⚙️ В работе' :
                 recognition.status === 'rejected' ? '✗ Отклонено' :
                 '📝 Новый'}
              </span>
            </div>
            <Button variant="outline" onClick={() => router.push('/annotations')}>
              ← Назад
            </Button>
            
            {/* Undo/Redo кнопки */}
            <div className="flex items-center gap-2 border-l border-r px-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={undo}
                disabled={!canUndo()}
                title={`Отменить (${modKey}+Z)`}
                className="h-8"
              >
                ↶ Undo
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={redo}
                disabled={!canRedo()}
                title={`Вернуть (${modKey}+Shift+Z)`}
                className="h-8"
              >
                ↷ Redo
              </Button>
              {(canUndo() || canRedo()) && (
                <span className="text-xs text-gray-500">
                  {historyIndex + 1}/{history.length}
                </span>
              )}
            </div>
            
            {recognition.has_modifications && (
              <Button 
                variant="outline"
                onClick={handleRecognitionRestore}
                className="text-orange-600 border-orange-600 hover:bg-orange-50"
              >
                ↻ Восстановить оригинал
              </Button>
            )}
            <Button onClick={() => handleStatusChange('completed')}>
              Done
            </Button>
          </div>
        </div>

        {/* Динамические hotkeys hints */}
        <Card className="p-3 mb-4 bg-blue-50 border-blue-200">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Hotkeys:</span> {getHotkeyHint()}
          </div>
        </Card>

        <div className="grid grid-cols-12 gap-4">
          {/* Left sidebar - Список bbox */}
          <div className="col-span-3">
            <Card className="p-4 h-[calc(100vh-180px)] overflow-y-auto">
              {/* Блюда из чека */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3 text-sm text-gray-700">Блюда из чека</h3>
              <div className="space-y-2">
                {recognition.correct_dishes.map((dish: any, index: number) => {
                  const count = dish.Count || 1
                    const bboxCount = getDishAnnotationCount(index)
                    const dishBboxes = dishes[index] || []
                  const allDishes = dish.Dishes || []
                    const displayName = allDishes[0]?.Name || allDishes[0]?.product_name || 'Unknown'
                    const hasMultiple = allDishes.length > 1

                  // Не показываем блюда без bbox
                  if (dishBboxes.length === 0) return null

                  return (
                    <div
                      key={index}
                        className="border rounded p-2 bg-white"
                      >
                        {/* Header блюда */}
                        <div 
                          className="flex items-center justify-between mb-1 cursor-pointer"
                      onClick={() => {
                            // Клик на блюдо - выбрать первый bbox
                            if (dishBboxes.length > 0) {
                              dispatch({ type: 'SET_SELECTED', payload: { annotation: dishBboxes[0] } })
                          setShowOnlySelected(true)
                        }
                      }}
                    >
                        <div className="flex items-center gap-2">
                          <div 
                              className="w-3 h-3 rounded border-2 border-gray-300 flex-shrink-0"
                            style={{ backgroundColor: getDishColor(index) }}
                          />
                          <span className="text-xs font-mono text-gray-500">#{index + 1}</span>
                            {hasMultiple && (
                            <span className="text-xs text-orange-600 font-medium">
                                [{allDishes.length} вар.]
                            </span>
                          )}
                        </div>
                          <Badge className={bboxCount >= count ? 'bg-green-500' : 'bg-yellow-500'}>
                            {bboxCount}/{count}
                        </Badge>
                      </div>
                      
                        {/* Показываем название только если один вариант без bbox */}
                        {!hasMultiple && dishBboxes.length === 0 && (
                          <p className="text-xs font-medium">{displayName}</p>
                        )}
                        
                        {/* Если bbox ровно один - показываем компактно с действиями */}
                        {dishBboxes.length === 1 && (
                          <div
                            className={`flex items-center justify-between text-sm py-1 px-2 rounded cursor-pointer ${
                              selectedAnnotation?.id === dishBboxes[0].id ? 'bg-blue-100' : 'hover:bg-gray-50'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation()
                              dispatch({ type: 'SET_SELECTED', payload: { annotation: dishBboxes[0] } })
                              setShowOnlySelected(true)
                            }}
                          >
                            <span className="text-gray-700 flex-1 mr-2">
                              {displayName}
                            </span>
                            <AnnotationControls
                              annotation={dishBboxes[0]}
                              originalAnnotations={currentImage?.original_annotations}
                              imageId={currentImage?.id}
                              compact={false}
                              showEdit={true}
                              showOverlapped={true}
                              showOrientation={true}
                              showError={true}
                              showDelete={true}
                              onUpdate={handleAnnotationUpdate}
                              onChangeDish={(id) => {
                                const rect = document.querySelector(`[data-annotation-id="${id}"]`)?.getBoundingClientRect()
                                if (rect) {
                                  setChangingDishFor(id)
                                  setDropdownPosition({
                                    x: rect.left,
                                    y: rect.bottom,
                                    width: 100,
                                    bboxWidth: 100
                                  })
                                }
                              }}
                              onToggleError={() => handleToggleError(dishBboxes[0].id, !dishBboxes[0].is_error)}
                              onDelete={() => handleAnnotationDelete(dishBboxes[0].id)}
                            />
                        </div>
                      )}
                        
                        {/* Список bbox - если их несколько */}
                        {dishBboxes.length > 1 && (
                          <div className="ml-2 space-y-1 mt-2 border-l-2 border-gray-200 pl-2">
                            {dishBboxes.map((bbox, bboxIdx) => {
                              // Если количество bbox совпадает с количеством вариантов блюда,
                              // показываем название варианта, иначе порядковый номер
                              let bboxLabel = `bbox #${bboxIdx + 1}`
                              if (hasMultiple && bboxIdx < allDishes.length) {
                                const variantName = allDishes[bboxIdx]?.Name || allDishes[bboxIdx]?.product_name
                                if (variantName) {
                                  bboxLabel = variantName
                                }
                              }
                              
                              return (
                                <div
                                  key={bbox.id}
                                  className={`flex items-center justify-between text-xs py-1 px-2 rounded cursor-pointer ${
                                    selectedAnnotation?.id === bbox.id ? 'bg-blue-100' : 'hover:bg-gray-50'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    dispatch({ type: 'SET_SELECTED', payload: { annotation: bbox } })
                                    setShowOnlySelected(true)
                                  }}
                                >
                                  <span className="text-gray-600 flex-1 mr-2">
                                    {bboxLabel}
                                  </span>
                                  <AnnotationControls
                                    annotation={bbox}
                                    originalAnnotations={currentImage?.original_annotations}
                                    imageId={currentImage?.id}
                                    compact={false}
                                    showEdit={true}
                                    showOverlapped={true}
                                    showOrientation={true}
                                    showError={true}
                                    showDelete={true}
                                    onUpdate={handleAnnotationUpdate}
                                    onChangeDish={(id) => {
                                      const rect = document.querySelector(`[data-annotation-id="${id}"]`)?.getBoundingClientRect()
                                      if (rect) {
                                        setChangingDishFor(id)
                                        setDropdownPosition({
                                          x: rect.left,
                                          y: rect.bottom,
                                          width: 100,
                                          bboxWidth: 100
                                        })
                                      }
                                    }}
                                    onToggleError={() => handleToggleError(bbox.id, !bbox.is_error)}
                                    onDelete={() => handleAnnotationDelete(bbox.id)}
                                  />
                    </div>
                  )
                })}
                        </div>
                      )}
                    </div>
                  )
                })}
                </div>
              </div>

              {/* Non-food объекты */}
              {nonFood.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-sm text-gray-700">Non-food объекты</h3>
                  <div className="space-y-2">
                    {nonFood.map((bbox) => {
                      const nonFoodObj = NON_FOOD_OBJECTS.find(obj => obj.id === bbox.object_subtype)
                      const name = nonFoodObj ? nonFoodObj.name : bbox.object_subtype || 'Unknown'
                      const icon = nonFoodObj ? nonFoodObj.icon : '📦'

                      return (
                        <div
                          key={bbox.id}
                          className={`border rounded p-2 bg-white flex items-center justify-between cursor-pointer ${
                            selectedAnnotation?.id === bbox.id ? 'bg-blue-100' : 'hover:bg-gray-50'
                          }`}
                onClick={() => {
                            dispatch({ type: 'SET_SELECTED', payload: { annotation: bbox } })
                            setShowOnlySelected(true)
                          }}
                        >
                          <span className="text-xs">
                            {icon} {name}
                          </span>
                          <AnnotationControls
                            annotation={bbox}
                            originalAnnotations={currentImage?.original_annotations}
                            imageId={currentImage?.id}
                            compact={false}
                            showEdit={false}
                            showOverlapped={true}
                            showOrientation={true}
                            showError={true}
                            showDelete={true}
                            onUpdate={handleAnnotationUpdate}
                            onToggleError={() => handleToggleError(bbox.id, !bbox.is_error)}
                            onDelete={() => handleAnnotationDelete(bbox.id)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Main content - Images */}
          <div className="col-span-9">
            <Card className="p-4">
              {/* Photo type selector и кнопка рисования */}
              <div className="flex gap-2 mb-4">
                <div className="flex gap-2">
                <Button
                  variant={currentPhotoType === 'Main' ? 'default' : 'outline'}
                  onClick={() => setCurrentPhotoType('Main')}
                >
                  Main (45°)
                </Button>
                <Button
                  variant={currentPhotoType === 'Qualifying' ? 'default' : 'outline'}
                  onClick={() => setCurrentPhotoType('Qualifying')}
                >
                  Qualifying (90°)
                  </Button>
                </div>
                <div className="flex-1"></div>
                <Button
                  variant={drawingMode ? 'default' : 'outline'}
                  onClick={() => {
                    const newDrawingMode = !drawingMode
                    setDrawingMode(newDrawingMode)
                    if (newDrawingMode) {
                      // При включении рисования - очищаем экран
                      dispatch({ type: 'SET_SELECTED', payload: { annotation: null } })
                      setShowOnlySelected(true)
                    }
                  }}
                >
                  {drawingMode ? 'Отменить рисование' : 'Нарисовать bbox'}
                </Button>
              </div>

              {/* Image with annotations */}
              {currentImage ? (
                <div className="h-[calc(100vh-280px)] rounded overflow-hidden">
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${currentImage.storage_path}`}
                    annotations={getFilteredAnnotations(currentImage.annotations)}
                    originalAnnotations={currentImage.original_annotations}
                    imageId={currentImage.id}
                    dishNames={getDishNames()}
                    selectedDishIndex={selectedAnnotation?.dish_index ?? null}
                    onAnnotationCreate={(bbox) => handleAnnotationCreate(currentImage.id, bbox)}
                    onAnnotationUpdate={handleAnnotationUpdate}
                    onAnnotationSelect={(ann) => {
                      // Игнорируем виртуальную аннотацию (pendingBBox)
                      if (ann && ann.id === -1) return
                      
                      dispatch({ type: 'SET_SELECTED', payload: { annotation: ann } })
                      if (ann) {
                        setShowOnlySelected(true) // Включаем фильтрацию при выборе
                      }
                    }}
                    selectedAnnotation={selectedAnnotation}
                    drawingMode={drawingMode}
                    referenceWidth={currentImage.photo_type === 'Main' ? 1810 : 1410}
                    referenceHeight={1080}
                    onChangeDish={(id, position) => {
                      // Игнорируем виртуальную аннотацию (pendingBBox)
                      if (id === -1) return
                      setChangingDishFor(id)
                      setDropdownPosition(position)
                    }}
                    onDelete={handleAnnotationDelete}
                    onToggleOverlapped={(id) => {
                      // Игнорируем виртуальную аннотацию (pendingBBox)
                      if (id === -1) return
                      const ann = currentImage.annotations.find(a => a.id === id)
                      if (ann) {
                        handleAnnotationUpdate(id, { is_overlapped: !ann.is_overlapped })
                      }
                    }}
                    onToggleOrientation={(id) => {
                      // Игнорируем виртуальную аннотацию (pendingBBox)
                      if (id === -1) return
                      const ann = currentImage.annotations.find(a => a.id === id)
                      if (ann) {
                        // Циклический переключатель: null -> true -> false -> null
                        const newOrientation = ann.is_bottle_up === null ? true : (ann.is_bottle_up ? false : null)
                        handleAnnotationUpdate(id, { is_bottle_up: newOrientation })
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-[calc(100vh-280px)] flex items-center justify-center text-gray-500">
                  Изображение не найдено
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Dropdown для выбора типа объекта (табы) */}
        {(pendingBBox || changingDishFor !== null) && (
          (() => {
            const dropdownWidth = 500
            const dropdownHeight = 600
            
            // Центрируем по экрану при первом открытии
              const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
              const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
              
            // Если modalPosition не установлена, центрируем
            let left = modalPosition.x || Math.max(20, (screenWidth - dropdownWidth) / 2)
            let top = modalPosition.y || Math.max(20, (screenHeight - dropdownHeight) / 2)
            
            // Инициализируем позицию если она еще не установлена
            if (modalPosition.x === 0 && modalPosition.y === 0) {
              setTimeout(() => {
                setModalPosition({
                  x: Math.max(20, (screenWidth - dropdownWidth) / 2),
                  y: Math.max(20, (screenHeight - dropdownHeight) / 2)
                })
              }, 0)
            }

            const filteredMenuAll = searchMenuAll(menuSearch)
            
            return (
              <div 
                className="fixed bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col"
                style={{ 
                  left: `${left}px`, 
                  top: `${top}px`,
                  width: `${dropdownWidth}px`,
                  height: `${dropdownHeight}px`,
                  zIndex: 100
                }}
              >
                {/* Header - Draggable */}
                <div 
                  className="p-3 border-b bg-white flex-shrink-0 cursor-move select-none"
                  onMouseDown={handleModalMouseDown}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Что вы добавили?
                    </h3>
                    <button
                      className="text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setPendingBBox(null)
                        setChangingDishFor(null)
                        setDropdownPosition(null)
                        setMenuSearch('')
                        setActiveTab('check')
                        setModalPosition({ x: 0, y: 0 }) // Сбрасываем позицию
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              
                {/* Табы */}
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
                      activeTab === 'menu' 
                        ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => setActiveTab('menu')}
                  >
                    🍽️ Меню
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
                </div>
              
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Таб 1: Блюда из чека */}
                  {activeTab === 'check' && (
                    <div className="space-y-2">
                      {recognition.correct_dishes.map((dish: any, dishIndex: number) => {
                        const dishes = dish.Dishes || []
                        return dishes.map((variant: any, variantIdx: number) => (
                        <button
                            key={`${dishIndex}-${variantIdx}`}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-2 text-sm rounded"
                          onClick={() => {
                            if (pendingBBox) {
                                finishAnnotationCreate('food', null, dishIndex, false)
                            } else if (changingDishFor !== null) {
                                changeDishForAnnotation('food', null, dishIndex, false)
                            }
                          }}
                        >
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getDishColor(dishIndex) }}
                          />
                          <div className="flex-1 min-w-0 truncate">
                              <span className="font-medium text-gray-700">#{dishIndex + 1}</span>
                              <span className="text-gray-600 ml-1">{variant.Name || variant.product_name}</span>
                          </div>
                        </button>
                        ))
                      })}
                    </div>
                  )}

                  {/* Таб 2: Активное меню (menu_all) */}
                  {activeTab === 'menu' && (
                    <div className="space-y-3">
                      <input
                      type="text"
                      placeholder="Поиск по EAN или названию..."
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="space-y-1">
                      {!menuAll || menuAll.length === 0 ? (
                        <div className="text-sm text-gray-500 px-3 py-2 text-center bg-gray-50 rounded border border-gray-200">
                          <p className="font-medium">📋 Активное меню недоступно</p>
                          <p className="text-xs mt-2">Для этого recognition нет данных меню</p>
                          <p className="text-xs mt-1 text-gray-400">Используйте вкладку "Из чека" или "Предметы"</p>
                  </div>
                      ) : filteredMenuAll.length > 0 ? (
                        filteredMenuAll.map((item: any, idx: number) => (
                          <button
                            key={item.ExternalId || idx}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-sm rounded border border-gray-200"
                            onClick={async () => {
                              // Добавляем блюдо из меню в correct_dishes локально
                              const newDish = {
                                Count: 1,
                                Dishes: [{
                                  Name: item.Name,
                                  product_name: item.Name,
                                  ean: item.ExternalId,
                                  proto_name: item.ProtoNames && item.ProtoNames[0] ? item.ProtoNames[0] : null
                                }]
                              }
                              
                              // Обновляем recognition локально и на сервере
                              if (recognition) {
                                const updatedCorrectDishes = [...recognition.correct_dishes, newDish]
                                const updatedRecognition = {
                                  ...recognition,
                                  correct_dishes: updatedCorrectDishes
                                }
                                setRecognition(updatedRecognition)
                                
                                // Сохраняем на сервере
                                try {
                                  await fetch(`/api/annotations/recognitions/${resolvedParams.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      correct_dishes: updatedCorrectDishes
                                    })
                                  })
                                } catch (error) {
                                  console.error('Error updating correct_dishes:', error)
                                }
                              }
                              
                              const newIndex = recognition.correct_dishes.length
                              if (pendingBBox) {
                                finishAnnotationCreate('food', null, newIndex, false)
                              } else if (changingDishFor !== null) {
                                changeDishForAnnotation('food', null, newIndex, false)
                              }
                            }}
                          >
                            <div className="truncate text-gray-700 font-medium">{item.Name}</div>
                            {item.ExternalId && (
                              <div className="text-xs text-gray-500 mt-1">EAN: {item.ExternalId}</div>
                            )}
                            {item.ProtoNames && item.ProtoNames.length > 0 && item.ProtoNames[0] && (
                              <div className="text-xs text-gray-400 mt-0.5">{item.ProtoNames.join(', ')}</div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 px-3 py-2 text-center">
                          {menuSearch ? 'Ничего не найдено' : 'Начните вводить для поиска'}
                      </div>
                      )}
                    </div>
                    </div>
                  )}

                  {/* Таб 3: Non-food объекты */}
                  {activeTab === 'nonfood' && (
                    <div className="space-y-2">
                      {NON_FOOD_OBJECTS.map((obj) => (
                          <button
                          key={obj.id}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-sm rounded flex items-center gap-2"
                            onClick={() => {
                              if (pendingBBox) {
                              finishAnnotationCreate('non_food', obj.id, null, false)
                              } else if (changingDishFor !== null) {
                              changeDishForAnnotation('non_food', obj.id, null, false)
                              }
                            }}
                          >
                          <span>{obj.icon}</span>
                          <span className="text-gray-700">{obj.name}</span>
                          </button>
                        ))}
                      </div>
                  )}

                </div>
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
