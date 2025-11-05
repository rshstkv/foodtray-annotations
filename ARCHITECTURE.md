# Архитектура системы аннотаций

## Обзор

Система управления аннотациями использует централизованную архитектуру на основе **React useReducer** для предсказуемого управления состоянием и автоматической истории Undo/Redo.

---

## Ключевые принципы

### 1. Единая точка изменений
Все изменения состояния аннотаций проходят через **reducer**. Это гарантирует:
- Предсказуемость - всегда понятно как изменяется состояние
- Отладку - все actions можно логировать
- Согласованность - невозможно забыть создать snapshot

### 2. Автоматические snapshots
При каждом изменении аннотаций **reducer автоматически**:
- Создает snapshot текущего состояния
- Добавляет его в историю
- Вычисляет `has_modifications` сравнивая с оригиналом

### 3. Разделение ответственности
- **Reducer** - управление состоянием, история, snapshots
- **Компонент** - UI логика, API вызовы, user interactions

---

## Структура состояния

### AppState
```typescript
interface AppState {
  images: RecognitionImage[]           // Изображения с аннотациями
  recognition: Recognition | null      // Данные recognition
  selectedAnnotation: Annotation | null // Выбранная аннотация
  history: HistorySnapshot[]           // История для Undo/Redo
  historyIndex: number                 // Текущая позиция в истории
}
```

### HistorySnapshot
```typescript
interface HistorySnapshot {
  images: RecognitionImage[]
  recognition: Recognition
  selectedAnnotation: Annotation | null
}
```

---

## Actions (типы изменений)

### Инициализация данных
```typescript
dispatch({
  type: 'INIT_DATA',
  payload: { images, recognition, menuAll }
})
```
- Загружает данные с сервера
- Создает initial snapshot
- Сбрасывает историю

### Создание аннотации
```typescript
dispatch({
  type: 'CREATE_ANNOTATION',
  payload: { annotation, imageId }
})
```
- Добавляет аннотацию в images
- Создает snapshot
- Вычисляет has_modifications
- Устанавливает selectedAnnotation

### Обновление аннотации
```typescript
dispatch({
  type: 'UPDATE_ANNOTATION',
  payload: { id, updates }
})
```
- Обновляет поля аннотации
- Создает snapshot
- Вычисляет has_modifications
- Обновляет selectedAnnotation если нужно

### Удаление аннотации
```typescript
dispatch({
  type: 'DELETE_ANNOTATION',
  payload: { id }
})
```
- Удаляет аннотацию из images
- Создает snapshot
- Вычисляет has_modifications
- Сбрасывает selectedAnnotation если нужно

### Обновление статуса
```typescript
dispatch({
  type: 'UPDATE_STATUS',
  payload: { status }
})
```
- Обновляет статус recognition
- НЕ создает snapshot (метаданные, не аннотации)

### Выбор аннотации
```typescript
dispatch({
  type: 'SET_SELECTED',
  payload: { annotation }
})
```
- Устанавливает selectedAnnotation
- НЕ создает snapshot (UI состояние)

### Undo
```typescript
dispatch({ type: 'UNDO' })
```
- Откатывает на предыдущий snapshot
- Восстанавливает images, recognition, selectedAnnotation

### Redo
```typescript
dispatch({ type: 'REDO' })
```
- Возвращает следующий snapshot
- Восстанавливает images, recognition, selectedAnnotation

---

## Паттерны использования

### Изменение аннотации (типичный flow)

```typescript
const handleAnnotationUpdate = async (id: number, updates: any) => {
  // 1. Найти аннотацию (для API)
  const annotation = images.flatMap(img => img.annotations).find(a => a.id === id)
  
  // 2. Dispatch изменения (автоматически создаст snapshot)
  dispatch({
    type: 'UPDATE_ANNOTATION',
    payload: { id, updates }
  })
  
  // 3. Синхронизация с сервером в фоне
  fetch(`/api/annotations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }).catch(error => {
    // В случае ошибки - перезагрузить данные
    fetchRecognition()
  })
}
```

### Создание аннотации

```typescript
const finishAnnotationCreate = async (objectType, dishIndex, ...) => {
  // 1. API вызов
  const response = await fetch('/api/annotations', {
    method: 'POST',
    body: JSON.stringify({ ... })
  })
  
  const newAnnotation = await response.json()
  
  // 2. Dispatch (автоматически создаст snapshot)
  dispatch({
    type: 'CREATE_ANNOTATION',
    payload: { annotation: newAnnotation, imageId }
  })
  
  // 3. UI cleanup
  setPendingBBox(null)
  setDrawingMode(false)
}
```

---

## Автоматический has_modifications

Reducer автоматически вычисляет `has_modifications` при каждом изменении:

```typescript
function calculateHasModifications(currentImages, originalSnapshot) {
  const currentAnnotations = currentImages.flatMap(img => img.annotations)
  const originalAnnotations = originalSnapshot.images.flatMap(img => img.annotations)
  
  // Сравниваем только значимые поля
  return JSON.stringify(normalize(currentAnnotations)) !== 
         JSON.stringify(normalize(originalAnnotations))
}
```

Это гарантирует:
- ✅ Один источник истины
- ✅ Всегда актуальное значение
- ✅ Невозможно забыть обновить

---

## Ограничения истории

- Максимум **50 snapshots**
- При переполнении удаляются самые старые
- History сбрасывается при:
  - Загрузке новых данных (INIT_DATA)
  - Полном восстановлении оригинала

---

## Преимущества архитектуры

### 1. Надежность
- Невозможно забыть создать snapshot
- Невозможно обновить состояние неконсистентно
- Единственный способ изменить состояние - через dispatch

### 2. Отладка
- Все actions можно логировать
- Можно добавить Redux DevTools
- Легко воспроизвести ошибки

### 3. Тестируемость
- Reducer - чистая функция
- Легко писать unit тесты
- Предсказуемое поведение

### 4. Расширяемость
- Добавить новый action - просто добавить case в reducer
- Добавить новое поле в state - обновить интерфейс
- Добавить middleware - обернуть dispatch

---

## Миграция с useState

Старый код:
```typescript
const [images, setImages] = useState([])
const [history, setHistory] = useState([])

const handleUpdate = () => {
  setImages(prevImages => ...)
  setTimeout(() => createSnapshot(), 0) // ЛЕГКО ЗАБЫТЬ!
}
```

Новый код:
```typescript
const [state, dispatch] = useReducer(annotationReducer, initialState)
const { images, history } = state

const handleUpdate = () => {
  dispatch({ type: 'UPDATE_ANNOTATION', payload: {...} })
  // Snapshot создается АВТОМАТИЧЕСКИ!
}
```

---

## Будущие улучшения

1. **Redux DevTools** - подключить для визуализации actions
2. **Middleware** - для логирования, аналитики
3. **Optimistic updates** - улучшить UX при медленном интернете
4. **Batching** - группировать множественные изменения в один snapshot
5. **Persist** - сохранять историю в localStorage

