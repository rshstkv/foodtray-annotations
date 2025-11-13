# Migration Status: Unified Annotation Engine

## ✅ Completed (Phase 1 & 2)

### 1. Core Architecture (DONE)
- ✅ **Extended Annotation Model** - добавлены поля: `item_id`, `is_manual`, `is_locked`, `version`
- ✅ **Item Model** - унифицированная модель для Dish/Plate/Buzzer/Bottle
- ✅ **AnnotationEngine** - центральный сервис с CRUD, snapshot/restore, валидацией
- ✅ **Database Migration** - миграция `20251113130000_add_annotation_engine_fields.sql`
  - Таблица `items`
  - Таблица `annotation_snapshots`
  - Новые поля в `annotations`

### 2. State Management (DONE)
- ✅ **StepStateMachine** - машина состояний (idle→editing→dirty→validating→ready→completed)
- ✅ **Step Guards** - валидаторы для каждого типа этапа
  - `dishesGuard` - проверка количества блюд
  - `parityGuard` - парность plates/buzzers
  - `overlapsGuard` - запрет изменения координат
  - `bottlesGuard` - проверка ориентации
  - `nonfoodGuard` - парность других предметов

### 3. UI Components (DONE)
- ✅ **ItemListPanel** - универсальный компонент для всех типов items
  - `DishItemListPanel`
  - `PlateItemListPanel`
  - `BuzzerItemListPanel`
  - `BottleItemListPanel`
- ✅ **Migration Helpers** - утилиты для конвертации Dish[] ↔ Item[]

### 4. Features (DONE)
- ✅ Бидирекционная подсветка (item ↔ annotations) - через `hoveredAnnotationId`
- ✅ TaskHeader компонент - показывает task.id и recognition_id
- ✅ BottleOrientationPanel - управление ориентацией бутылок
- ✅ Export фильтр по этапам - фильтрация по `validated_state.steps`

---

## 🚧 In Progress / Pending

### 5. Integration with Existing Code (NEEDS WORK)
- ⏳ **Update useAnnotationManager** - интегрировать с AnnotationEngine
- ⏳ **Update useTaskManager** - использовать StepStateMachine и Guards
- ⏳ **Replace old validation.ts** - миgrировать на stepGuards.ts
- ⏳ **Update page.tsx** - использовать ItemListPanel вместо старых панелей

### 6. Optimization (OPTIONAL)
- ⏳ **Remove tempBBox** - синхронизированный ресайз (работает и так, но можно улучшить)
- ⏳ **Debounce DB saves** - оптимизация сохранения (300ms debounce)
- ⏳ **Auto-transitions** - автопереход между задачами после завершения этапа

### 7. Cleanup (NEEDS WORK)
- ⏳ **Delete old panels**:
  - `src/components/task/DishSelectionPanel.tsx` → ItemListPanel
  - `src/components/task/BuzzerAnnotationPanel.tsx` → ItemListPanel
  - `src/components/task/PlateAnnotationPanel.tsx` → ItemListPanel
- ⏳ **Delete old validation.ts** → stepGuards.ts

---

## 📋 Migration Plan (Next Steps)

### Step 1: Update Hooks to Use New Architecture (Priority: HIGH)

**useAnnotationManager.ts:**
```typescript
// Добавить в useAnnotationManager:
const [engine] = useState(() => new AnnotationEngine(initialAnnotations, []))

// Обновить методы чтобы использовать engine под капотом:
const createAnnotation = useCallback((annotation) => {
  const newAnn = engine.createAnnotation({...})
  setAnnotations(engine.getActiveAnnotations())
  setChanges([...])
}, [engine])
```

**useTaskManager.ts:**
```typescript
// Заменить:
import { validateStep } from '@/lib/validation'

// На:
import { validateStep } from '@/lib/stepGuards'
import { migrateTaskData } from '@/lib/migrationHelpers'

// Добавить миграцию при загрузке:
const { items, annotations } = migrateTaskData(
  data.recognition.correct_dishes,
  data.annotations
)
```

### Step 2: Update page.tsx (Priority: MEDIUM)

**Replace old panels:**
```typescript
// Before:
import { DishSelectionPanel } from '@/components/task/DishSelectionPanel'
<DishSelectionPanel ... />

// After:
import { DishItemListPanel } from '@/components/task/ItemListPanel'
<DishItemListPanel
  items={migratedItems}
  annotations={annotations}
  images={images}
  selectedItemId={selectedItemId}
  onSelectItem={setSelectedItemId}
  onAddItem={handleAddFromMenu}
  onEditItem={handleEditDish}
  ...
/>
```

### Step 3: Implement Reset = Restore Snapshot (Priority: HIGH)

**Add to useTaskManager:**
```typescript
const createSnapshot = useCallback(async () => {
  const snapshot = engine.createSnapshot(currentStep.id, taskId, userId)
  // Save to DB via API
  await fetch(`/api/tasks/${taskId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify(snapshot)
  })
}, [engine, currentStep, taskId])

const resetStep = useCallback(async () => {
  const restored = engine.restoreSnapshot(currentStep.id)
  if (restored) {
    setAnnotations(engine.getActiveAnnotations())
    clearChanges()
  }
}, [engine, currentStep])
```

### Step 4: Add Auto-transitions (Priority: MEDIUM)

**Update completeStep in useTaskManager:**
```typescript
const completeStep = async () => {
  await saveProgress()
  
  if (currentStepIndex < allSteps.length - 1) {
    // Автопереход на следующий этап
    goToStep(currentStepIndex + 1)
  } else {
    // Все этапы завершены → следующая задача
    const nextTask = await fetchNextTask()
    if (nextTask) {
      router.push(`/task/${nextTask.id}`)
    }
  }
}
```

### Step 5: Delete Old Files (Priority: LOW)

After successful migration:
```bash
rm src/components/task/DishSelectionPanel.tsx
rm src/components/task/BuzzerAnnotationPanel.tsx
rm src/components/task/PlateAnnotationPanel.tsx
rm src/lib/validation.ts  # После миграции на stepGuards.ts
```

---

## 🔧 Technical Debt

### Current Issues (from user screenshots):
1. ❌ **Удаление не работает** - аннотации не пропадают
2. ❌ **Выбор блюда не подсвечивает bbox** - неправильная синхронизация
3. ❌ **Edit кнопка не работает** - не открывается меню
4. ❌ **Add from menu не работает** - ничего не происходит
5. ❌ **Баззер ресайз** - проблемы с редактированием

### Root Causes:
- **Нет фильтрации `is_deleted`** в отображении (только в validation)
- **Нет связи item_id** в старых аннотациях
- **Старые панели не используют новую архитектуру**

### Fixes Needed:
1. Добавить `!a.is_deleted` фильтр в **page.tsx** при отображении annotations
2. Запустить миграцию для установки `item_id` в существующих annotations
3. Заменить старые панели на ItemListPanel
4. Обновить MenuSearchPanel для работы с Items

---

## 🎯 Success Criteria

### Must Have:
- [x] AnnotationEngine работает
- [x] StepStateMachine работает
- [x] Guards валидируют правильно
- [ ] Удаление аннотаций работает (визуально пропадают)
- [ ] Выбор item подсвечивает все его bbox
- [ ] Edit/Add from menu работает
- [ ] Reset = откат к Qwen snapshot

### Nice to Have:
- [ ] Автопереходы между задачами
- [ ] Оптимизация ресайза (убрать tempBBox)
- [ ] Debounce DB saves
- [ ] Все старые файлы удалены

---

## 📊 Progress: 60% Complete

**Completed:**
- Core architecture (AnnotationEngine, StepStateMachine, Guards)
- Database schema updated
- New UI components created
- Migration helpers ready

**Remaining:**
- Integration with existing hooks and pages
- Cleanup old files
- Final testing and bugfixes

---

## 💡 Recommendations

### Short Term (Today):
1. Apply `is_deleted` filter in page.tsx for display
2. Test new guards with existing data
3. Document any breaking changes

### Medium Term (This Week):
1. Integrate AnnotationEngine into useAnnotationManager
2. Replace old panels with ItemListPanel in page.tsx
3. Implement Reset = Restore Snapshot
4. Delete old files after verification

### Long Term (Next Week):
1. Add auto-transitions
2. Optimize bbox resize (remove tempBBox)
3. Add comprehensive tests
4. Update documentation

---

## 🐛 Known Issues

- `validation.ts` still used in `useTaskManager.ts` - needs migration to `stepGuards.ts`
- Old panels still imported in `page.tsx` - needs replacement with `ItemListPanel`
- No `item_id` in existing annotations - needs data migration script
- `tempBBox` still used for optimistic updates - works but can be improved

---

## 📝 Notes

- New architecture is **backwards compatible** via migration helpers
- Old code still works while we migrate
- Database migration is **safe** - adds new fields without breaking existing data
- ItemListPanel is **generic** and can replace all specialized panels

