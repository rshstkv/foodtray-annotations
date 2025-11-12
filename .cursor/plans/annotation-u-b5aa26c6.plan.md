<!-- b5aa26c6-f9fd-45ba-b6b8-76093efb311f 8f840562-9f3b-4d35-b411-102ca3c6d86b -->
# Annotation UX Improvements

## Контекст

Недавний коммит упростил DishSelectionPanel и создал два новых компонента:

- [`src/components/task/BuzzerAnnotationPanel.tsx`](src/components/task/BuzzerAnnotationPanel.tsx) - UI для буззеров с inline color selector
- [`src/components/task/PlateAnnotationPanel.tsx`](src/components/task/PlateAnnotationPanel.tsx) - UI для тарелок с индикаторами по картинкам

Эти компоненты НЕ интегрированы в основную страницу задачи. Текущая реализация в [`src/app/task/[id]/page.tsx`](src/app/task/[id]/page.tsx) (строки 176-192) показывает только placeholder-текст.

## Phase 1: Интеграция панелей аннотации

### 1.1 Интегрировать BuzzerAnnotationPanel

В [`src/app/task/[id]/page.tsx`](src/app/task/[id]/page.tsx):

**Импорт (добавить к строке 16):**

```typescript
import { BuzzerAnnotationPanel } from '@/components/task/BuzzerAnnotationPanel'
```

**Заменить блок validate_buzzers (строки 176-183):**

```typescript
{currentStep.step.id === 'validate_buzzers' && (
  <BuzzerAnnotationPanel
    annotations={annotationManager.annotations.filter(
      a => a.object_type === 'buzzer' && !a.is_deleted
    )}
    onStartDrawing={(color) => {
      annotationManager.startDrawing('buzzer')
      // Сохраняем выбранный цвет для использования при создании
      annotationManager.setDrawingMetadata({ color })
    }}
    isDrawing={annotationManager.isDrawing}
  />
)}
```

**Обновить создание аннотации (строка ~220):**

Найти блок `onAnnotationCreate` и добавить `object_subtype` для buzzer:

```typescript
onAnnotationCreate={(bbox) => {
  const objectType = annotationManager.drawingObjectType || 'dish'
  const metadata = annotationManager.drawingMetadata || {}
  
  annotationManager.createAnnotation({
    image_id: image.id,
    ...bbox,
    object_type: objectType,
    object_subtype: objectType === 'buzzer' ? metadata.color : null,
    // ... остальные поля
  })
  annotationManager.stopDrawing()
}}
```

### 1.2 Добавить metadata в useAnnotationManager

В [`src/hooks/useAnnotationManager.ts`](src/hooks/useAnnotationManager.ts):

**Добавить state:**

```typescript
const [drawingMetadata, setDrawingMetadata] = useState<Record<string, any>>({})
```

**Обновить return:**

```typescript
return {
  // ... existing
  drawingMetadata,
  setDrawingMetadata,
}
```

### 1.3 Интегрировать PlateAnnotationPanel

В [`src/app/task/[id]/page.tsx`](src/app/task/[id]/page.tsx):

**Импорт:**

```typescript
import { PlateAnnotationPanel } from '@/components/task/PlateAnnotationPanel'
```

**Заменить блок validate_plates (строки 185-192):**

```typescript
{currentStep.step.id === 'validate_plates' && (
  <PlateAnnotationPanel
    annotations={annotationManager.annotations.filter(
      a => a.object_type === 'plate' && !a.is_deleted
    )}
    expectedCount={task.recognition.correct_dishes?.length || 0}
    onStartDrawing={() => {
      annotationManager.startDrawing('plate')
    }}
    isDrawing={annotationManager.isDrawing}
  />
)}
```

### 1.4 Исправить DishSelectionPanel props

В [`src/app/task/[id]/page.tsx`](src/app/task/[id]/page.tsx) строки 165-173:

Удалить неиспользуемые props `onAssignToSelected` и `onStartDrawing`:

```typescript
<DishSelectionPanel
  dishesFromReceipt={task.recognition.correct_dishes}
  annotations={annotationManager.annotations}
  selectedDishIndex={selectedDishIndex}
  onSelectDish={handleSelectDish}
  onAddFromMenu={handleAddFromMenu}
/>
```

Удалить handlers `handleAssignToSelected` и `handleStartDrawing` (строки 53-68).

## Phase 2: Полные фильтры на /tasks

### 2.1 Обновить интерфейсы

В [`src/app/tasks/page.tsx`](src/app/tasks/page.tsx):

**Добавить task_scope к Task interface (строка 26):**

```typescript
interface Task {
  // ... existing
  task_scope: {
    steps: Array<{ id: string; name: string }>
  } | null
}
```

**Добавить state для фильтров (после строки 58):**

```typescript
const [priorityFilter, setPriorityFilter] = useState<string>('all')
const [scopeFilter, setScopeFilter] = useState<string>('all')
const [assignedFilter, setAssignedFilter] = useState<string>('all')
const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; full_name: string | null }>>([])
```

### 2.2 Загрузка пользователей

**Добавить загрузку пользователей в useEffect:**

```typescript
useEffect(() => {
  if (user && isAdmin) {
    loadUsers()
  }
}, [user, isAdmin])

const loadUsers = async () => {
  try {
    const response = await apiFetch<{ users: Array<any> }>('/api/admin/users')
    if (response.success && response.data) {
      setAllUsers(response.data.users || [])
    }
  } catch (err) {
    console.error('Error loading users:', err)
  }
}
```

### 2.3 UI фильтров

Добавить фильтры после статистики (после строки ~130):

```typescript
{/* Filters */}
<Card className="mb-6">
  <div className="p-4">
    <h3 className="font-medium mb-4">Фильтры</h3>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Status filter - уже есть */}
      
      {/* Priority filter */}
      <div>
        <label className="text-sm text-gray-700 block mb-2">Приоритет</label>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Все приоритеты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="high">Высокий</SelectItem>
            <SelectItem value="medium">Средний</SelectItem>
            <SelectItem value="low">Низкий</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Scope filter */}
      <div>
        <label className="text-sm text-gray-700 block mb-2">Тип задач</label>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Все типы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="validate_dishes">Блюда</SelectItem>
            <SelectItem value="validate_buzzers">Буззеры</SelectItem>
            <SelectItem value="validate_plates">Тарелки</SelectItem>
            <SelectItem value="validate_bottles">Бутылки</SelectItem>
            <SelectItem value="full_cycle">Полный цикл</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Assigned filter (admin only) */}
      {isAdmin && (
        <div>
          <label className="text-sm text-gray-700 block mb-2">Назначено</label>
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Все пользователи" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="unassigned">Не назначено</SelectItem>
              {allUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  </div>
</Card>
```

### 2.4 Применить фильтры

**Обновить loadTasks (строка 66):**

```typescript
const loadTasks = async () => {
  try {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter)
    if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter)
    if (scopeFilter && scopeFilter !== 'all') params.append('scope', scopeFilter)
    if (assignedFilter && assignedFilter !== 'all') {
      if (assignedFilter === 'unassigned') {
        params.append('assigned', 'false')
      } else {
        params.append('userId', assignedFilter)
      }
    }

    const response = await apiFetch<{ tasks: Task[]; stats: Stats }>(
      `/api/tasks/list?${params.toString()}`
    )
    // ... rest
  }
}
```

**Обновить useEffect dependencies (строка 60):**

```typescript
useEffect(() => {
  if (user) {
    loadTasks()
  }
}, [user, statusFilter, priorityFilter, scopeFilter, assignedFilter])
```

### 2.5 Обновить API endpoint

В [`src/app/api/tasks/list/route.ts`](src/app/api/tasks/list/route.ts):

**Добавить обработку новых фильтров (после строки ~30):**

```typescript
const priority = searchParams.get('priority')
const scope = searchParams.get('scope')

// ... existing query setup ...

if (priority) {
  query = query.eq('priority', priority)
}

if (scope) {
  // Фильтр по scope требует проверки JSON column
  // Используем PostgreSQL JSON operators
  query = query.contains('task_scope', { steps: [{ id: scope }] })
}
```

## Testing Checklist

После интеграции проверить:

1. **Buzzers**: Открыть задачу с validate_buzzers, выбрать цвет, нарисовать bbox на обеих картинках
2. **Plates**: Открыть задачу с validate_plates, нарисовать тарелки, проверить индикаторы Main/Quality
3. **Dishes**: Убедиться что упрощенная панель работает (клик для выбора, без лишних кнопок)
4. **Filters**: Проверить все комбинации фильтров на /tasks (статус, приоритет, scope, пользователи)
5. **No regressions**: Сохранение, hotkeys (S, Enter, Esc), навигация по шагам

## Важные замечания

- BuzzerAnnotationPanel требует `drawingMetadata` для сохранения выбранного цвета
- PlateAnnotationPanel считает `expectedCount` из `correct_dishes.length`
- Фильтр по scope может не работать без обновления API (JSON column query)
- Все старые handlers (`handleAssignToSelected`, `handleStartDrawing`) можно удалить

### To-dos

- [ ] Интегрировать BuzzerAnnotationPanel в page.tsx (импорт, replace placeholder, color metadata)
- [ ] Добавить drawingMetadata state в useAnnotationManager hook
- [ ] Интегрировать PlateAnnotationPanel в page.tsx (импорт, replace placeholder)
- [ ] Удалить неиспользуемые handlers (handleAssignToSelected, handleStartDrawing) и props из DishSelectionPanel
- [ ] Добавить state для новых фильтров (priority, scope, assigned, allUsers) в tasks/page.tsx
- [ ] Реализовать loadUsers() для фильтра по пользователям (только для admin)
- [ ] Добавить UI для всех фильтров (priority, scope, assigned) на страницу tasks
- [ ] Обновить loadTasks() и API endpoint для поддержки новых фильтров
- [ ] Протестировать buzzers/plates рисование и все комбинации фильтров