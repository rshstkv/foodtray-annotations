#!/usr/bin/env python3
"""
Генератор seed.sql из текущего состояния БД.

Экспортирует первые 100 recognitions из локальной БД в seed.sql.
Supabase автоматически применяет seed.sql после каждого db reset.

Usage:
    python3 scripts/generate_seed_from_db.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime
import json

# Добавляем путь к проекту
sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv('.env.local')

from supabase import create_client

def escape_sql_string(s):
    """Экранирует строку для SQL."""
    if s is None:
        return 'NULL'
    s = str(s).replace("'", "''").replace('\\', '\\\\')
    return f"'{s}'"

def main():
    print("=" * 70)
    print("GENERATING seed.sql FROM DATABASE")
    print("=" * 70)
    print()
    
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase credentials")
        sys.exit(1)
    
    if 'localhost' not in supabase_url and '127.0.0.1' not in supabase_url:
        print("❌ Only works with local database!")
        sys.exit(1)
    
    print(f"✅ Connected to: {supabase_url}")
    
    supabase = create_client(supabase_url, supabase_key)
    
    # Получаем 100 recognitions
    limit = 100
    print(f"📥 Fetching {limit} recognitions...")
    
    result = supabase.table('recognitions').select('*').limit(limit).execute()
    recognitions = result.data
    
    if not recognitions:
        print("❌ No recognitions found in database")
        sys.exit(1)
    
    print(f"✅ Loaded {len(recognitions)} recognitions")
    
    # Получаем images
    recognition_ids = [r['recognition_id'] for r in recognitions]
    result = supabase.table('recognition_images').select('*').in_('recognition_id', recognition_ids).execute()
    images = result.data
    
    print(f"✅ Loaded {len(images)} images")
    
    # Получаем annotations
    image_ids = [img['id'] for img in images]
    result = supabase.table('annotations').select('*').in_('image_id', image_ids).execute()
    annotations = result.data
    
    print(f"✅ Loaded {len(annotations)} annotations")
    print()
    
    # Генерируем SQL
    print("📝 Generating SQL...")
    
    sql_lines = []
    sql_lines.append("-- Seed data for local development")
    sql_lines.append("-- Auto-generated from database by scripts/generate_seed_from_db.py")
    sql_lines.append(f"-- Generated: {datetime.now().isoformat()}")
    sql_lines.append(f"-- Contains: {len(recognitions)} recognitions, {len(images)} images, {len(annotations)} annotations")
    sql_lines.append("")
    
    # Получаем ID dish_validation stage
    sql_lines.append("-- Get dish_validation stage_id")
    sql_lines.append("DO $$")
    sql_lines.append("DECLARE")
    sql_lines.append("  v_stage_id INTEGER;")
    sql_lines.append("BEGIN")
    sql_lines.append("  SELECT ws.id INTO v_stage_id")
    sql_lines.append("  FROM workflow_stages ws")
    sql_lines.append("  JOIN task_types tt ON ws.task_type_id = tt.id")
    sql_lines.append("  WHERE tt.code = 'dish_validation'")
    sql_lines.append("  LIMIT 1;")
    sql_lines.append("")
    
    # Recognitions
    sql_lines.append("  -- Insert recognitions")
    for rec in recognitions:
        rid = rec['recognition_id']
        date = rec.get('recognition_date', '')
        correct_dishes = json.dumps(rec.get('correct_dishes', [])).replace("'", "''")
        menu_all = json.dumps(rec.get('menu_all', [])).replace("'", "''")
        has_check_error = rec.get('has_check_error', False)
        validation_mode = rec.get('validation_mode', None)
        validation_mode_sql = escape_sql_string(validation_mode) if validation_mode else 'NULL'
        
        sql_lines.append(f"  INSERT INTO recognitions (recognition_id, recognition_date, status, has_modifications, is_mistake, correct_dishes, menu_all, workflow_state, current_stage_id, has_check_error, validation_mode)")
        sql_lines.append(f"  VALUES ({rid}, {escape_sql_string(date)}, 'not_started', FALSE, FALSE, '{correct_dishes}'::jsonb, '{menu_all}'::jsonb, 'pending', v_stage_id, {has_check_error}, {validation_mode_sql})")
        sql_lines.append(f"  ON CONFLICT (recognition_id) DO NOTHING;")
        sql_lines.append("")
    
    # Images
    sql_lines.append("  -- Insert images")
    for img in images:
        img_id = img['id']
        rid = img['recognition_id']
        photo_type = img.get('photo_type', 'Main')
        storage_path = img.get('storage_path', '')
        
        sql_lines.append(f"  INSERT INTO recognition_images (id, recognition_id, photo_type, storage_path)")
        sql_lines.append(f"  VALUES ({img_id}, {rid}, {escape_sql_string(photo_type)}, {escape_sql_string(storage_path)})")
        sql_lines.append(f"  ON CONFLICT (id) DO NOTHING;")
        sql_lines.append("")
    
    # Annotations
    sql_lines.append("  -- Insert annotations")
    for ann in annotations:
        ann_id = ann['id']
        img_id = ann['image_id']
        bbox_x1 = ann.get('bbox_x1', 0)
        bbox_y1 = ann.get('bbox_y1', 0)
        bbox_x2 = ann.get('bbox_x2', 0)
        bbox_y2 = ann.get('bbox_y2', 0)
        object_type = ann.get('object_type', 'food')
        dish_index = ann.get('dish_index')
        source = ann.get('source', 'qwen_auto')
        
        sql_lines.append(f"  INSERT INTO annotations (id, image_id, bbox_x1, bbox_y1, bbox_x2, bbox_y2, object_type, dish_index, source)")
        sql_lines.append(f"  VALUES ({ann_id}, {img_id}, {bbox_x1}, {bbox_y1}, {bbox_x2}, {bbox_y2}, {escape_sql_string(object_type)}, {dish_index if dish_index is not None else 'NULL'}, {escape_sql_string(source)})")
        sql_lines.append(f"  ON CONFLICT (id) DO NOTHING;")
        sql_lines.append("")
    
    sql_lines.append("  RAISE NOTICE 'Seed data loaded: % recognitions, % images, % annotations', ")
    sql_lines.append(f"    {len(recognitions)}, {len(images)}, {len(annotations)};")
    sql_lines.append("END $$;")
    
    # Записываем в файл
    output_file = Path(__file__).parent.parent / 'supabase' / 'seed.sql'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_lines))
    
    print(f"✅ Generated: {output_file}")
    print()
    print("=" * 70)
    print("✅ SEED.SQL GENERATED SUCCESSFULLY!")
    print("=" * 70)
    print()
    print(f"File: {output_file}")
    print(f"Size: {output_file.stat().st_size / 1024:.1f} KB")
    print()
    print("Next time after 'npx supabase db reset --local',")
    print("seed.sql will be applied automatically!")
    print()

if __name__ == '__main__':
    main()

