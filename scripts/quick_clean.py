#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv('.env.production')
import psycopg2

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

print('🧹 Cleaning production database...\n')

tables = [
    'work_annotations',
    'work_items', 
    'validation_work_log',
    'initial_annotations',
    'initial_tray_items',
    'recipe_line_options',
    'recipe_lines',
    'recipes',
    'images',
    'recognitions',
    'raw.qwen_annotations',
    'raw.recipes',
    'raw.recognition_files'
]

for table in tables:
    cur.execute(f'DELETE FROM {table}')
    print(f'✓ {table}: {cur.rowcount} rows deleted')

conn.commit()
conn.close()

print('\n✅ Database cleaned!')

