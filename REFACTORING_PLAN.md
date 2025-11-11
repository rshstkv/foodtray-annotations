# План рефакторинга системы аннотаций

## Контекст проекта

Система для аннотирования изображений заказов еды. Есть два типа изображений для каждого заказа:
- **Main (45°)** - основное изображение
- **Qualifying (90°)** - контрольное изображение

Задача аннотаторов - проверить и исправить автоматическую разметку (QWEN), убедиться что:
- Все блюда из чека размечены правильными bounding boxes
- Количество bbox на обеих картинках совпадает с чеком
- Тарелки размечены (если есть)
- Дополнительные объекты размечены (баззеры, non-food items)

## Текущее состояние (коммит aabca52)

### Что работает:
- ✅ Базовый интерфейс `/annotations/[id]` - полная разметка одного recognition
- ✅ Quick mode в `/annotations/tasks/dish_validation?mode=quick`
- ✅ Edit mode в `/annotations/tasks/dish_validation?mode=edit`
- ✅ Автоматический расчет validation_mode (quick/edit) на основе совпадения количества блюд
- ✅ Создание, обновление, удаление аннотаций
- ✅ Hotkeys для навигации
- ✅ DishList компонент для отображения блюд из чека

### Проблемы:
1. **Интерфейс `/annotations/[id]` устаревший**:
   - Использует reducer и undo/redo (не нужно)
   - Табы для переключения между изображениями (неудобно)
   - Нет тарелок в левой панели
   - Отличается от edit mode в dish_validation

2. **Тарелки не учитываются в validation_mode**:
   - Quick mode определяется только по блюдам
   - Plates должны тоже учитываться: quick только если И блюда И plates совпадают

3. **Нумерация сбивает**:
   - Если есть тарелки (#1), то первое блюдо #2, но это сбивает с толку
   - Нужна более интуитивная система

4. **Нет тулбоксов над bbox**:
   - В edit mode нет контролов над каждым bbox (resize, overlapped, error, delete)
   - Для тарелок нет таких же операций как для блюд

5. **Задачи исчезают после создания аннотаций**:
   - API использует старое поле `status` вместо `workflow_state`
   - После создания аннотации recognition переходит в `status='in_progress'`
   - Но поиск задач идет по `workflow_state='pending'`
   - Результат: задача исчезает из очереди

## План исправлений

### 🔴 КРИТИЧНО: Исправить workflow_state vs status

**Проблема**: Задачи исчезают после любого изменения аннотаций.

**Корень**: В базе есть ДВА поля (из-за миграций в разное время):
- `status` (старое, миграция 20251104): 'not_started', 'in_progress', 'completed', 'rejected'
- `workflow_state` (новое, миграция 20251106): 'pending', 'in_progress', 'completed', 'requires_correction'

**Текущая ситуация**:
- ✅ Все endpoints для **поиска** задач используют `workflow_state` (правильно)
- ❌ Endpoints для **создания/обновления/удаления** аннотаций обновляют `status` (неправильно!)
- ❌ После создания аннотации: `status='in_progress'`, но `workflow_state='pending'`
- ❌ Задача остается в `workflow_state='pending'`, но уже не показывается (какая-то дополнительная логика фильтрует)

**Проверено в коде**:
- `/api/annotations/tasks/next` (строка 120): `.eq('workflow_state', 'pending')` ✅
- `/api/annotations/annotations/route.ts` (строка 77): `status: 'in_progress'` ❌
- `/api/annotations/annotations/[id]/route.ts` (строки 96, 182): `status: 'in_progress'` ❌

**Решение**:

1. **Файл**: `src/app/api/annotations/annotations/route.ts` (POST - создание аннотации)
   - Строки 66-87: Заменить `status` на `workflow_state`
   ```typescript
   // Было:
   const { data: recognition } = await supabase
     .from('recognitions')
     .select('status')
     .eq('recognition_id', image.recognition_id)
     .single()

   if (recognition && recognition.status !== 'completed') {
     await supabase
       .from('recognitions')
       .update({ 
         status: 'in_progress',
         has_modifications: true
       })
   
   // Должно быть:
   const { data: recognition } = await supabase
     .from('recognitions')
     .select('workflow_state')
     .eq('recognition_id', image.recognition_id)
     .single()

   if (recognition && recognition.workflow_state !== 'completed') {
     await supabase
       .from('recognitions')
       .update({ 
         workflow_state: 'in_progress',
         has_modifications: true
       })
   ```

2. **Файл**: `src/app/api/annotations/annotations/[id]/route.ts` (PUT и DELETE)
   - Строки 85-110 (PUT): Заменить `status` на `workflow_state`
   - Строки 171-196 (DELETE): Заменить `status` на `workflow_state`
   - Аналогично предыдущему пункту

**Тестирование**:
- Открыть задачу в quick mode
- Нарисовать bbox или изменить существующий
- Обновить страницу
- ✅ Задача должна остаться в списке (не исчезнуть)

---

### 📋 Учесть тарелки в validation_mode

**Проблема**: Quick mode определяется только по блюдам, тарелки игнорируются.

**Решение**:

1. **Файл**: `supabase/migrations/YYYYMMDDHHMMSS_update_validation_mode_with_plates.sql`
   ```sql
   -- Обновить функцию calculate_validation_mode
   CREATE OR REPLACE FUNCTION calculate_validation_mode(recognition_id_param TEXT)
   RETURNS TEXT AS $$
   DECLARE
     main_dishes_count INT;
     qual_dishes_count INT;
     main_plates_count INT;
     qual_plates_count INT;
     expected_count INT;
     dish_record RECORD;
   BEGIN
     -- Получаем изображения
     -- ... (существующий код для блюд)
     
     -- ДОБАВИТЬ: Подсчет тарелок
     SELECT COUNT(*) INTO main_plates_count
     FROM annotations a
     JOIN recognition_images ri ON a.image_id = ri.id
     WHERE ri.recognition_id = recognition_id_param
       AND ri.photo_type = 'Main'
       AND a.object_type = 'plate';
     
     SELECT COUNT(*) INTO qual_plates_count
     FROM annotations a
     JOIN recognition_images ri ON a.image_id = ri.id
     WHERE ri.recognition_id = recognition_id_param
       AND ri.photo_type = 'Qualifying'
       AND a.object_type = 'plate';
     
     -- Проверка тарелок (включая 0:0 как валидное совпадение)
     IF main_plates_count != qual_plates_count THEN
       RETURN 'edit';
     END IF;
     
     -- ... (остальная логика для блюд)
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **Файл**: `src/hooks/useDishValidation.ts`
   - Добавить подсчет тарелок в `isAligned`:
   ```typescript
   const mainPlatesCount = mainImage?.annotations.filter(a => a.object_type === 'plate').length || 0
   const qualPlatesCount = qualImage?.annotations.filter(a => a.object_type === 'plate').length || 0
   const platesAligned = mainPlatesCount === qualPlatesCount
   
   const isAligned = dishesAligned && platesAligned
   ```

3. **Файл**: `src/components/tasks/DishList.tsx`
   - Добавить секцию "ТАРЕЛКИ" перед "БЛЮДА ИЗ ЧЕКА"
   - Показывать badge `M:X Q:Y` для тарелок
   - Цвет: зеленый если совпадают (включая 0:0), красный если нет

**Тестирование**:
- Задача с тарелками M:1 Q:0 → должна быть в edit mode (красный badge)
- Задача с тарелками M:0 Q:0 → может быть в quick mode (если блюда совпадают)
- Задача с тарелками M:2 Q:2 → может быть в quick mode (если блюда совпадают)

---

### 🎨 Переписать `/annotations/[id]` - унификация с edit mode

**Проблема**: Интерфейс `/annotations/[id]` устаревший, отличается от edit mode.

**Цель**: Сделать `/annotations/[id]` идентичным `dish_validation` edit mode.

**Решение**:

1. **Удалить из `/annotations/[id]/page.tsx`**:
   - Reducer (`useReducer`, `AnnotationAction`, `annotationReducer`)
   - Undo/redo логика
   - Табы для переключения изображений
   - Старый UI с большими плашками

2. **Добавить в `/annotations/[id]/page.tsx`**:
   - Использовать `useAnnotations` hook (как в `DishValidationClient.tsx`)
   - Два изображения одновременно (side-by-side)
   - `DishList` компонент в левой панели
   - Тарелки в левой панели с полными контролами
   - Draggable popup с табами для создания аннотаций (чек, предметы, тарелки, баззер)
   - Hotkeys: 1=тарелки, 2-9=блюда, H=показать все, D=рисовать, Del=удалить, Tab=переключить активное изображение

3. **Структура нового `/annotations/[id]/page.tsx`**:
   ```typescript
   // Использовать как референс: src/app/annotations/tasks/dish_validation/DishValidationClient.tsx
   
   export default function AnnotationPage({ params }) {
     const { images, createAnnotation, updateAnnotation, deleteAnnotation, setLocalImages } = useAnnotations([])
     
     // UI state
     const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
     const [drawingMode, setDrawingMode] = useState(false)
     const [showAllBBoxes, setShowAllBBoxes] = useState(true)
     const [highlightedDishIndex, setHighlightedDishIndex] = useState<number | null>(null)
     const [highlightedPlate, setHighlightedPlate] = useState(false)
     
     // Popup state для создания аннотаций
     const [pendingBBox, setPendingBBox] = useState(...)
     const [activeTab, setActiveTab] = useState<'check' | 'nonfood' | 'plate' | 'buzzer'>('check')
     
     // Layout: Left panel (DishList) + Two images side-by-side
     return (
       <div className="flex">
         <div className="w-96">
           <DishList
             dishes={recognition.correct_dishes}
             images={images}
             onDishClick={handleDishClick}
             onPlateClick={handlePlateClick}
             showControls={true}
           />
         </div>
         <div className="flex-1 grid grid-cols-2 gap-4">
           <BBoxAnnotator imageUrl={mainImage} ... />
           <BBoxAnnotator imageUrl={qualifyingImage} ... />
         </div>
       </div>
     )
   }
   ```

**Тестирование**:
- Открыть `/annotations/109734`
- ✅ Два изображения одновременно
- ✅ Тарелки в левой панели
- ✅ Hotkeys работают
- ✅ Можно рисовать bbox на активном изображении
- ✅ Draggable popup для выбора типа объекта

---

### 🛠️ Добавить тулбоксы над bbox

**Проблема**: Нет контролов над каждым bbox для быстрых операций.

**Решение**:

1. **Файл**: `src/components/BBoxAnnotator.tsx`
   - Добавить prop `showControls: boolean`
   - Если `showControls={true}`, показывать тулбокс над каждым bbox с кнопками:
     - 📏 Resize (уже есть, просто показать)
     - 🔄 Overlapped (toggle `is_overlapped`)
     - 🍾 Bottle up/down (toggle `is_bottle_up` для бутылок)
     - ⚠️ Error (toggle `is_error`)
     - 🗑️ Delete

2. **Файл**: `src/app/annotations/[id]/page.tsx`
   ```typescript
   <BBoxAnnotator
     showControls={true}  // Всегда показывать в полном интерфейсе
     ...
   />
   ```

3. **Файл**: `src/app/annotations/tasks/dish_validation/DishValidationClient.tsx`
   ```typescript
   <BBoxAnnotator
     showControls={displayMode === 'edit'}  // Только в edit mode
     ...
   />
   ```

4. **Для тарелок**: Те же контролы, что и для блюд (кроме bottle orientation)

**Тестирование**:
- Открыть edit mode
- Навести на bbox
- ✅ Появляется тулбокс с кнопками
- ✅ Клик на кнопку меняет свойство аннотации
- ✅ Для тарелок тоже работает

---

### 🔢 Улучшить нумерацию в DishList

**Проблема**: Текущая нумерация:
- Если тарелок нет: блюда #1, #2, #3...
- Если тарелки есть: тарелки #1, блюда #2, #3, #4...

Это правильно, но можно улучшить UX.

**Предложение 1 (текущее)**: Оставить как есть
- Pros: Логично - видишь #2, нажимаешь "2"
- Cons: Первое блюдо может быть #1 или #2 в зависимости от тарелок

**Предложение 2**: Фиксированная нумерация
- Тарелки всегда #1 (клавиша "1")
- Блюда всегда #2-9 (клавиши "2-9")
- Если тарелок нет, клавиша "1" не работает
- Pros: Всегда одинаково
- Cons: Видишь #2, но это первое блюдо (может сбивать)

**Рекомендация**: Оставить текущую логику (Предложение 1), она более интуитивная.

**Файл**: `src/components/tasks/DishList.tsx`
```typescript
// Текущая логика (правильная):
<span className="text-xs font-mono text-gray-500">
  #{hasPlates ? index + 2 : index + 1}
</span>
```

---

### 🔄 Логика переключения между bbox одного блюда

**Проблема**: Если в чеке 1 блюдо, но bbox 2 (ошибка разметки), нужно переключаться между ними.

**Решение**:

1. **Файл**: `src/app/annotations/tasks/dish_validation/DishValidationClient.tsx`
   - В `handleDishClick`: если кликнули на уже выбранное блюдо, циклически переключаться между его bbox
   ```typescript
   const handleDishClick = (dishIndex: number) => {
     if (highlightedDishIndex === dishIndex) {
       // Переключение между bbox этого блюда
       const allBboxes = [
         ...mainImage.annotations.filter(a => a.dish_index === dishIndex),
         ...qualImage.annotations.filter(a => a.dish_index === dishIndex)
       ]
       if (allBboxes.length > 1) {
         const nextIndex = (selectedBBoxIndexInDish + 1) % allBboxes.length
         setSelectedBBoxIndexInDish(nextIndex)
         setSelectedAnnotation(allBboxes[nextIndex])
       }
     } else {
       // Первый выбор блюда
       setHighlightedDishIndex(dishIndex)
       setSelectedBBoxIndexInDish(0)
       // ...
     }
   }
   ```

2. **Hotkey**: Повторное нажатие клавиши (например, "2" потом еще раз "2") тоже переключает

**Тестирование**:
- Блюдо #2 имеет 2 bbox (M:1, Q:1, но в чеке Count=1)
- Нажать "2" → выделяется первый bbox
- Нажать "2" еще раз → выделяется второй bbox
- Нажать "2" еще раз → снова первый bbox (цикл)

---

### 📦 Выбор конкретного варианта блюда

**Проблема**: Если в чеке для одного item несколько возможных блюд (Dishes.length > 1), нужно выбрать конкретное.

**Решение**:

1. **Миграция**: `supabase/migrations/YYYYMMDDHHMMSS_add_dish_variant_selection.sql`
   ```sql
   ALTER TABLE annotations 
   ADD COLUMN selected_dish_variant_index INTEGER;
   
   COMMENT ON COLUMN annotations.selected_dish_variant_index IS 
   'Индекс выбранного варианта блюда из Dishes массива (если Dishes.length > 1)';
   ```

2. **Файл**: `src/types/annotations.ts`
   ```typescript
   export interface Annotation {
     // ... existing fields
     selected_dish_variant_index?: number | null
   }
   ```

3. **Файл**: `src/components/tasks/DishList.tsx`
   - Если `Dishes.length > 1`, показывать список вариантов под блюдом
   - Клик на вариант → вызывает `onVariantSelect(dishIndex, variantIndex)`
   ```typescript
   {dish.Dishes.length > 1 && (
     <div className="mt-2 space-y-1">
       <p className="text-xs text-gray-500">Выберите вариант:</p>
       {dish.Dishes.map((variant, varIdx) => (
         <button
           key={varIdx}
           onClick={() => onVariantSelect?.(dishIndex, varIdx)}
           className="w-full text-left text-xs hover:bg-blue-50 px-2 py-1"
         >
           • {variant.Name || variant.product_name}
         </button>
       ))}
     </div>
   )}
   ```

4. **Файл**: `src/app/annotations/tasks/dish_validation/DishValidationClient.tsx`
   ```typescript
   const handleVariantSelect = async (dishIndex: number, variantIndex: number) => {
     // Обновить все bbox этого блюда
     const allBboxes = [
       ...mainImage.annotations.filter(a => a.dish_index === dishIndex),
       ...qualImage.annotations.filter(a => a.dish_index === dishIndex)
     ]
     
     for (const bbox of allBboxes) {
       await updateAnnotation(bbox.id, { selected_dish_variant_index: variantIndex })
     }
   }
   
   // Перед завершением задачи проверить что все варианты выбраны
   const handleComplete = async () => {
     const unselectedDishes = taskData.recognition.correct_dishes
       .filter((dish, idx) => {
         if (dish.Dishes.length <= 1) return false
         const bboxes = images.flatMap(img => 
           img.annotations.filter(a => a.dish_index === idx)
         )
         return bboxes.some(b => b.selected_dish_variant_index == null)
       })
     
     if (unselectedDishes.length > 0) {
       alert('Выберите конкретный вариант для блюд с неоднозначностью')
       return
     }
     
     await completeTask()
   }
   ```

**Тестирование**:
- Блюдо #2: Count=1, Dishes=[{Name: "FUZE TEA"}, {Name: "FUZE TEA LEMON"}]
- В левой панели под блюдом #2 показывается список вариантов
- Клик на "FUZE TEA" → все bbox этого блюда помечаются `selected_dish_variant_index=0`
- Попытка завершить задачу без выбора → ошибка
- После выбора → задача завершается успешно

---

## Порядок выполнения

1. **🔴 КРИТИЧНО**: Исправить workflow_state vs status (без этого система не работает)
2. Учесть тарелки в validation_mode
3. Добавить тулбоксы над bbox
4. Переписать `/annotations/[id]`
5. Логика переключения между bbox
6. Выбор конкретного варианта блюда

## Важные замечания

### ⚠️ НИКОГДА не делать db reset
```bash
# ❌ ЗАПРЕЩЕНО
supabase db reset

# ✅ ТОЛЬКО migration up
supabase migration up
```

### Тестирование после каждого изменения

После каждого пункта:
1. Перезапустить dev server: `npm run dev`
2. Очистить кэш: `rm -rf .next`
3. Проверить в браузере
4. Если ошибка - откатить коммит и исправить

### Референсные файлы

- **Хороший пример edit mode**: `src/app/annotations/tasks/dish_validation/DishValidationClient.tsx`
- **Хороший пример DishList**: `src/components/tasks/DishList.tsx`
- **Хороший пример BBoxAnnotator**: `src/components/BBoxAnnotator.tsx`

### Структура базы данных

```sql
-- Основные таблицы
recognitions (
  recognition_id TEXT PRIMARY KEY,
  workflow_state TEXT,  -- 'pending', 'in_progress', 'completed'
  status TEXT,          -- УСТАРЕЛО, не использовать
  validation_mode TEXT, -- 'quick', 'edit'
  correct_dishes JSONB,
  task_queue TEXT,      -- 'dish_validation', 'check_error', etc
  assigned_to TEXT,
  has_modifications BOOLEAN
)

recognition_images (
  id SERIAL PRIMARY KEY,
  recognition_id TEXT REFERENCES recognitions,
  photo_type TEXT,      -- 'Main', 'Qualifying'
  storage_path TEXT,
  original_annotations JSONB  -- Для отката к QWEN
)

annotations (
  id SERIAL PRIMARY KEY,
  image_id INTEGER REFERENCES recognition_images,
  object_type TEXT,     -- 'food', 'plate', 'buzzer', 'non_food'
  object_subtype TEXT,
  dish_index INTEGER,   -- Индекс в correct_dishes массиве
  bbox_x1, bbox_y1, bbox_x2, bbox_y2 INTEGER,
  is_overlapped BOOLEAN,
  is_bottle_up BOOLEAN,
  is_error BOOLEAN,
  source TEXT,          -- 'qwen_auto', 'manual'
  selected_dish_variant_index INTEGER  -- Новое поле
)
```

## Ожидаемый результат

После всех исправлений:

1. ✅ Задачи не исчезают после изменений
2. ✅ Тарелки учитываются в quick/edit mode
3. ✅ `/annotations/[id]` идентичен edit mode
4. ✅ Тулбоксы над каждым bbox
5. ✅ Можно переключаться между bbox одного блюда
6. ✅ Можно выбрать конкретный вариант при неоднозначности
7. ✅ Единая логика для блюд и тарелок
8. ✅ Интуитивная нумерация

---

**Последний рабочий коммит**: `aabca52` (fix: исправлены вызовы finishAnnotationCreate для plates и dishes)

**Ветка**: `feature/annotation-workflow`

**Дата**: 2025-11-11

