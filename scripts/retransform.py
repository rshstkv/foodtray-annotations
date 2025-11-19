#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv('.env.production')
import psycopg2

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

print('1. Deleting domain data...')
cur.execute('DELETE FROM initial_annotations')
cur.execute('DELETE FROM initial_tray_items')
cur.execute('DELETE FROM recipe_line_options')
cur.execute('DELETE FROM recipe_lines')
cur.execute('DELETE FROM recipes')
cur.execute('DELETE FROM images')
cur.execute('DELETE FROM recognitions')
conn.commit()
print('   Done')

print('2. Running transforms...')
cur.execute('SELECT * FROM transform_recognitions_and_images()')
print(f'   Recognitions: {cur.fetchone()}')

cur.execute('SELECT * FROM transform_raw_recipes()')
print(f'   Recipes: {cur.fetchone()}')

cur.execute('SELECT * FROM transform_initial_items_and_annotations()')
print(f'   Items: {cur.fetchone()}')

conn.commit()

print('3. Checking results...')
cur.execute('SELECT COUNT(*) FROM recipe_line_options WHERE is_selected = false')
false_c = cur.fetchone()[0]
cur.execute('SELECT COUNT(*) FROM recipe_line_options WHERE is_selected = true')
true_c = cur.fetchone()[0]

print(f'   is_selected=false: {false_c}')
print(f'   is_selected=true: {true_c}')

if true_c == 0:
    print('\n✅ SUCCESS!')
else:
    print(f'\n❌ Problem: {true_c} still true')

conn.close()

