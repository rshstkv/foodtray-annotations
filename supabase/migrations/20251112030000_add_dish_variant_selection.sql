-- ============================================================================
-- Добавление поля для выбора конкретного варианта блюда
-- ============================================================================
-- Когда в чеке для одного блюда есть несколько возможных вариантов (Dishes.length > 1),
-- пользователь должен выбрать конкретный вариант. Это поле хранит индекс выбранного
-- варианта из массива Dishes[].

-- ============================================================================
-- 1. Добавить поле selected_dish_variant_index в таблицу annotations
-- ============================================================================

ALTER TABLE annotations 
ADD COLUMN IF NOT EXISTS selected_dish_variant_index INTEGER;

COMMENT ON COLUMN annotations.selected_dish_variant_index IS 
  'Индекс выбранного варианта блюда из массива correct_dishes[dish_index].Dishes[]. Используется когда Dishes.length > 1 (неоднозначность в определении блюда)';

-- ============================================================================
-- 2. Создать индекс для быстрого поиска аннотаций с выбранными вариантами
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_annotations_dish_variant 
  ON annotations(dish_index, selected_dish_variant_index) 
  WHERE selected_dish_variant_index IS NOT NULL;

COMMENT ON INDEX idx_annotations_dish_variant IS 
  'Индекс для быстрого поиска аннотаций с выбранными вариантами блюд';

-- ============================================================================
-- 3. Добавить constraint для валидации (индекс должен быть >= 0)
-- ============================================================================

ALTER TABLE annotations
ADD CONSTRAINT check_dish_variant_index_non_negative
CHECK (selected_dish_variant_index IS NULL OR selected_dish_variant_index >= 0);

COMMENT ON CONSTRAINT check_dish_variant_index_non_negative ON annotations IS
  'Проверка что selected_dish_variant_index >= 0 (если указан)';

-- ============================================================================
-- Логирование
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Added selected_dish_variant_index column to annotations table';
  RAISE NOTICE 'This field stores the index of the selected dish variant when Dishes.length > 1';
END $$;

