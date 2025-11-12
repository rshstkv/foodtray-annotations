# Задача: Отображение информации об аннотациях над изображениями

## Проблема
Компонент `ImageAnnotationInfo` показывает "Нет аннотаций", хотя на изображениях отображаются bounding boxes.

## Что работает ПРАВИЛЬНО
1. **BBoxAnnotator** (`src/components/BBoxAnnotator.tsx`) - компонент для отображения изображений с bounding boxes
   - Получает массив `annotations` через пропс
   - **КОРРЕКТНО отображает все bounding boxes на изображениях**
   - Показывает номера блюд (#1, #2, #3, #4, #5) на боксах

2. **TaskPage** (`src/app/task/[id]/page.tsx`) - главная страница задачи
   - Загружает аннотации через `annotationManager.annotations`
   - Фильтрует их по `image_id` и `object_type`:
     ```typescript
     const filteredAnnotations = annotationManager.annotations.filter(
       a => a.image_id === image.id && relevantTypes.includes(a.object_type)
     )
     ```
   - Передаёт `filteredAnnotations` в `BBoxAnnotator` - **это работает**
   - Передаёт `filteredAnnotations` в `ImageAnnotationInfo` - **это НЕ работает**

## Что НЕ работает
**ImageAnnotationInfo** (`src/components/task/ImageAnnotationInfo.tsx`) - компонент для отображения списка аннотаций над изображением
- Должен показывать список аннотаций (координаты, кнопки удаления)
- Получает **ТЕ ЖЕ САМЫЕ** `filteredAnnotations`, что и `BBoxAnnotator`
- Но показывает "Нет аннотаций"

## Использование в коде

### TaskPage передаёт одинаковые данные обоим компонентам:

```typescript
// src/app/task/[id]/page.tsx, строки 335-375

const relevantTypes = getRelevantObjectTypes()
const filteredAnnotations = annotationManager.annotations.filter(
  a => a.image_id === image.id && relevantTypes.includes(a.object_type)
)

return (
  <div className="relative h-full">
    {/* Компонент для отображения списка аннотаций НАД изображением */}
    {currentStep.step.id === 'validate_dishes' && (
      <ImageAnnotationInfo
        image={image}
        dishesFromReceipt={modifiedDishes || task.recognition.correct_dishes}
        annotations={filteredAnnotations}  // <-- ТЕ ЖЕ ДАННЫЕ
        selectedDishIndex={selectedDishIndex}
        onDeleteAnnotation={annotationManager.deleteAnnotation}
      />
    )}
    
    {/* Компонент для отображения изображения с bounding boxes */}
    <BBoxAnnotator
      imageUrl={`/api/bbox-images/${image.storage_path}`}
      annotations={filteredAnnotations}  // <-- ТЕ ЖЕ ДАННЫЕ
      selectedAnnotation={selectedForThisImage || null}
      // ... другие пропсы
    />
  </div>
)
```

## Что нужно сделать

**ЗАДАЧА: Исправить `ImageAnnotationInfo` так, чтобы он отображал те же аннотации, которые отображает `BBoxAnnotator`.**

### Требования:
1. Компонент должен показывать **все аннотации** для текущего изображения
2. Для каждой аннотации показывать:
   - Координаты bbox (например, "(123, 456)")
   - Кнопку удаления (корзинка)
   - При наведении - hover card с деталями
3. Показывать счётчик "X/Y" где:
   - X = количество аннотаций для выбранного блюда на этом изображении
   - Y = ожидаемое количество из чека (`dishesFromReceipt[selectedDishIndex].Count`)
4. Если `selectedDishIndex === null`, показывать все аннотации для изображения

### Текущий код ImageAnnotationInfo:

```typescript
// src/components/task/ImageAnnotationInfo.tsx

const getAnnotationsByDish = (dishIndex: number | null) => {
  // annotations уже отфильтрованы по image_id в TaskPage
  const result = annotations.filter(
    a =>
      !a.is_deleted &&
      a.bbox
  )
  return result
}

const dishAnnotations = getAnnotationsByDish(selectedDishIndex)
const count = dishAnnotations.length

// ... далее рендер
```

## Отладка

### Что проверить:
1. **Логирование в TaskPage** (строка 341):
   ```typescript
   console.log('TaskPage filteredAnnotations:', {
     imageType: image.image_type,
     total: filteredAnnotations.length,
     sample: filteredAnnotations.slice(0, 3)
   })
   ```
   - Сколько аннотаций передаётся?
   - Есть ли у них `bbox`?

2. **Логирование в ImageAnnotationInfo** (строка 29):
   ```typescript
   console.log('ImageAnnotationInfo RAW:', {
     imageType: image.image_type,
     totalAnnotations: annotations.length,
     annotationsSample: annotations.slice(0, 3)
   })
   ```
   - Сколько аннотаций получено?
   - Какие у них поля?

3. **Проверить в BBoxAnnotator**:
   - Как он обрабатывает `annotations`?
   - Какие поля использует для отображения bbox?

## Скриншот проблемы
![Проблема](./screenshot-issue.png)
- Над изображениями видны белые панели "Main" и "Quality" с текстом "Блюдо #1" и "Нет аннотаций"
- На самих изображениях отображаются bounding boxes с номерами #1, #2, #3, #4, #5
- **Это означает, что данные есть, но `ImageAnnotationInfo` их не видит**

## Ожидаемый результат
Компонент `ImageAnnotationInfo` должен показывать:
```
Main                    6/1 ✓
Блюдо #1
(123, 456) [🗑️]
(234, 567) [🗑️]
(345, 678) [🗑️]
...
```

## Важно
- **НЕ МЕНЯТЬ логику фильтрации в TaskPage** - она работает правильно
- **НЕ МЕНЯТЬ BBoxAnnotator** - он работает правильно
- **ИСПРАВИТЬ ТОЛЬКО ImageAnnotationInfo** - чтобы он использовал те же данные, что и BBoxAnnotator

## Файлы для изучения
1. `src/components/BBoxAnnotator.tsx` - как он обрабатывает `annotations`
2. `src/components/task/ImageAnnotationInfo.tsx` - что нужно исправить
3. `src/app/task/[id]/page.tsx` - как передаются данные (строки 335-375)
4. `src/types/annotations.ts` - типы данных

## Гипотезы
Возможные причины проблемы:
1. `ImageAnnotationInfo` фильтрует аннотации по полю, которого нет
2. `ImageAnnotationInfo` ожидает другую структуру данных
3. `ImageAnnotationInfo` проверяет какое-то условие, которое не выполняется
4. Проблема с типами TypeScript (например, `bbox` имеет другой тип)

**Нужно найти, почему `BBoxAnnotator` видит данные, а `ImageAnnotationInfo` - нет, хотя получают одинаковый массив `filteredAnnotations`.**

