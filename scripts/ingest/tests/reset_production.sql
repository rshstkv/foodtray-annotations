-- Reset production database - delete all data
-- Safe: preserves schema and migrations

BEGIN;

-- Delete work layer
DELETE FROM work_annotations;
DELETE FROM work_items;
DELETE FROM current_tray_items;

-- Delete domain layer
DELETE FROM validation_session_items;
DELETE FROM initial_annotations;
DELETE FROM initial_tray_items;
DELETE FROM recipe_line_options;
DELETE FROM recipe_lines;
DELETE FROM recipes;
DELETE FROM recognition_active_menu_items;
DELETE FROM images;
DELETE FROM recognitions;

-- Delete raw layer
DELETE FROM raw.qwen_annotations;
DELETE FROM raw.recipes;
DELETE FROM raw.recognition_files;

COMMIT;

