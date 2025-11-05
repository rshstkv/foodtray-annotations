-- Seed данные для task_types и workflow_stages

-- Очистка существующих данных (на случай повторного запуска)
DELETE FROM workflow_stages;
DELETE FROM task_types;

-- 1. Task Types

-- Задача 1: Проверка количества (быстрая)
INSERT INTO task_types (code, name, description, ui_config) VALUES
('count_validation', 'Проверка количества', 'Удаление лишних и добавление недостающих bbox',
'{
  "layout": "dual-image",
  "actions": {
    "bbox_create": true,
    "bbox_delete": true,
    "bbox_assign_dish": true,
    "correct_dish_change_count": true
  },
  "ui": {
    "show_both_images": true,
    "focus_mode": "bbox",
    "quick_keys": {
      "d": "delete",
      "a": "add",
      "n": "next"
    },
    "simplified_controls": true,
    "auto_next": false
  }
}'::jsonb);

-- Задача 2: Выбор правильного блюда (очень быстрая)
INSERT INTO task_types (code, name, description, ui_config) VALUES
('dish_selection', 'Выбор правильного блюда', 'Выбор корректного варианта из нескольких Dishes',
'{
  "layout": "single-image",
  "actions": {
    "correct_dish_select": true
  },
  "ui": {
    "show_menu_search": false,
    "focus_mode": "dishes",
    "quick_keys": {
      "1": "select_first",
      "2": "select_second",
      "3": "select_third",
      "n": "next"
    },
    "simplified_controls": true,
    "auto_next": true
  }
}'::jsonb);

-- Задача 3: Разметка перекрытий (бинарный выбор)
INSERT INTO task_types (code, name, description, ui_config) VALUES
('overlap_marking', 'Разметка перекрытий', 'Отметка bbox с перекрытиями между Main и Qualifying',
'{
  "layout": "dual-image",
  "actions": {
    "bbox_toggle_overlap": true
  },
  "ui": {
    "show_both_images": true,
    "focus_mode": "attributes",
    "quick_keys": {
      "y": "yes_overlap",
      "n": "no_overlap",
      "space": "next_bbox"
    },
    "simplified_controls": true,
    "auto_next": true
  },
  "filters": {
    "object_types": ["food"]
  }
}'::jsonb);

-- Задача 4: Ориентация объектов (быстрая)
INSERT INTO task_types (code, name, description, ui_config) VALUES
('bottle_orientation', 'Ориентация бутылок', 'Определение вертикальной/горизонтальной ориентации',
'{
  "layout": "single-image",
  "actions": {
    "bbox_toggle_bottle": true
  },
  "ui": {
    "focus_mode": "attributes",
    "quick_keys": {
      "up": "vertical",
      "right": "horizontal",
      "space": "next"
    },
    "simplified_controls": true,
    "auto_next": true
  },
  "filters": {
    "object_types": ["food"]
  }
}'::jsonb);

-- Задача 5: Уточнение границ (продвинутая)
INSERT INTO task_types (code, name, description, ui_config) VALUES
('bbox_refinement', 'Уточнение границ', 'Точная настройка границ bbox через resize и drag',
'{
  "layout": "dual-image",
  "actions": {
    "bbox_resize": true,
    "bbox_drag": true,
    "bbox_delete": true
  },
  "ui": {
    "show_both_images": true,
    "focus_mode": "bbox",
    "simplified_controls": false,
    "auto_next": false
  }
}'::jsonb);

-- Задача 6: Non-food объекты
INSERT INTO task_types (code, name, description, ui_config) VALUES
('non_food_objects', 'Дополнительные объекты', 'Разметка не-еды (руки, телефоны, кошельки, buzzers)',
'{
  "layout": "single-image",
  "actions": {
    "bbox_create": true,
    "bbox_delete": true,
    "bbox_change_type": true
  },
  "ui": {
    "focus_mode": "bbox",
    "simplified_controls": true,
    "auto_next": false
  }
}'::jsonb);

-- 2. Workflow Stages

-- Этап 1: Проверка количества (пропустить если main_count == qualifying_count)
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'count_validation'), 1, 'Проверка количества bbox',
'{"field": "main_count", "equals_field": "qualifying_count"}'::jsonb, false);

-- Этап 2: Выбор блюд (пропустить если все Dishes с одним вариантом)
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'dish_selection'), 2, 'Выбор правильного блюда',
'{"field": "all_dishes_single_variant", "equals": true}'::jsonb, false);

-- Этап 3: Перекрытия (опционально)
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'overlap_marking'), 3, 'Разметка перекрытий', null, true);

-- Этап 4: Ориентация (опционально)
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'bottle_orientation'), 4, 'Ориентация объектов', null, true);

-- Этап 5: Non-food (опционально)
INSERT INTO workflow_stages (task_type_id, stage_order, name, skip_condition, is_optional) VALUES
((SELECT id FROM task_types WHERE code = 'non_food_objects'), 5, 'Дополнительные объекты', null, true);

-- Вывод количества созданных записей для проверки
DO $$
DECLARE
  task_count INTEGER;
  stage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count FROM task_types;
  SELECT COUNT(*) INTO stage_count FROM workflow_stages;
  RAISE NOTICE 'Created % task types and % workflow stages', task_count, stage_count;
END $$;

