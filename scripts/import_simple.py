#!/usr/bin/env python3
"""
Простой импорт dataset в Supabase
- Параллельная загрузка в Storage
- Быстрая вставка через COPY
- Прогресс-бары
"""
import os
import sys
import json
import csv
import io
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import psycopg2
from supabase import create_client
from PIL import Image

def main():
    # Параметры
    if len(sys.argv) < 3:
        print("Usage: python3 import_simple.py <dataset_dir> <qwen_json> [--limit N] [--skip-storage]")
        sys.exit(1)
    
    dataset_dir = Path(sys.argv[1])
    qwen_json = Path(sys.argv[2])
    
    limit = None
    skip_storage = False
    
    for arg in sys.argv[3:]:
        if arg.startswith('--limit'):
            limit = int(sys.argv[sys.argv.index(arg) + 1])
        if arg == '--skip-storage':
            skip_storage = True
    
    # Load .env.local
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key_raw, val = line.strip().split('=', 1)
                    key_clean = key_raw.strip()
                    val_clean = val.strip().strip('"').strip("'")
                    os.environ[key_clean] = val_clean
    
    # Supabase setup
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    db_url = os.getenv("DATABASE_URL")
    
    if not all([url, key, db_url]):
        print("❌ Missing env vars in .env.local")
        print(f"   NEXT_PUBLIC_SUPABASE_URL: {'✓' if url else '✗'}")
        print(f"   SUPABASE_SERVICE_ROLE_KEY: {'✓' if key else '✗'}")
        print(f"   DATABASE_URL: {'✓' if db_url else '✗'}")
        sys.exit(1)
    
    supabase = create_client(url, key)
    
    print("=" * 60)
    print("📦 SIMPLE IMPORT")
    print("=" * 60)
    
    # 1. Load QWEN data (dict: image_path -> annotations)
    print("\n📥 Loading QWEN annotations...")
    with open(qwen_json, 'r') as f:
        qwen_dict = json.load(f)
    
    # Group by recognition_id
    qwen_by_rec = {}
    for image_path, annotations in qwen_dict.items():
        # Extract recognition_id from path
        # e.g. "data/recognition_100024/photos/recognition_100024_2025-10-11_Main.jpg"
        parts = image_path.split('/')
        rec_id = None
        for part in parts:
            if part.startswith('recognition_'):
                rec_id = part
                break
        
        if not rec_id:
            continue
        
        # Determine image type
        image_type = 'main' if '_Main' in image_path else 'quality'
        
        if rec_id not in qwen_by_rec:
            qwen_by_rec[rec_id] = {'main': None, 'quality': None}
        
        qwen_by_rec[rec_id][image_type] = {
            'image_path': image_path,
            **annotations
        }
    
    print(f"✅ Loaded {len(qwen_by_rec)} recognitions")
    
    # Limit if requested
    if limit:
        qwen_by_rec = dict(list(qwen_by_rec.items())[:limit])
        print(f"⚠️  LIMITED to {limit} recognitions")
    
    # 2. Find export directory
    export_dirs = list(dataset_dir.glob("export_*"))
    if not export_dirs:
        print(f"❌ No export_* directories in {dataset_dir}")
        sys.exit(1)
    
    export_dir = sorted(export_dirs)[-1]
    print(f"📁 Using: {export_dir.name}")
    
    # 3. Prepare data
    print("\n📊 Preparing data...")
    recognitions = []
    images_data = []
    annotations_data = []
    
    for rec_id, qwen_images in tqdm(qwen_by_rec.items(), desc="Preparing"):
        # Recognition
        main_qwen = qwen_images.get('main') or qwen_images.get('quality')
        if not main_qwen:
            continue
        
        # Load correct_dishes from JSON file
        rec_dir = export_dir / rec_id
        if not rec_dir.exists():
            continue
        
        correct_dishes = []
        menu_all = []
        
        # Find correct_dishes JSON
        dishes_json = list(rec_dir.glob('*correct_dishes.json'))
        if dishes_json:
            with open(dishes_json[0]) as f:
                correct_dishes = json.load(f)
        
        # Find menu_all JSON (активное меню = AM.json)
        menu_json = list(rec_dir.glob('*AM.json'))
        if menu_json:
            with open(menu_json[0]) as f:
                menu_all = json.load(f)
        
        rec_date = main_qwen.get('recognition_date', '2024-01-01')
        
        recognitions.append({
            'recognition_id': rec_id,
            'recognition_date': rec_date,
            'correct_dishes': correct_dishes,
            'menu_all': menu_all
        })
        
        # Images
        photos_dir = rec_dir / 'photos'
        if not photos_dir.exists():
            continue
        
        for image_type in ['main', 'quality']:
            qwen = qwen_images.get(image_type)
            if not qwen:
                continue
            
            # Find image file
            pattern = f"{rec_id}_*_{'Main' if image_type == 'main' else 'Qualifying'}.jpg"
            image_files = list(photos_dir.glob(pattern))
            if not image_files:
                continue
            
            local_path = image_files[0]
            
            storage_path = f"recognitions/{rec_id}/{image_type}.jpg"
            
            # Get real image dimensions
            with Image.open(local_path) as img:
                img_width, img_height = img.size
            
            images_data.append({
                'recognition_id': rec_id,
                'image_type': image_type,
                'storage_path': storage_path,
                'local_path': str(local_path),
                'original_annotations': qwen,
                'width': img_width,
                'height': img_height
            })
            
            # Annotations from QWEN
            # Dishes
            dishes_data = qwen.get('dishes', {})
            dish_detections = dishes_data.get('qwen_detections', [])
            for det in dish_detections:
                bbox = det.get('bbox_2d', [])
                if len(bbox) != 4:
                    continue
                
                # Normalize bbox using real image dimensions
                x1 = bbox[0] / img_width
                y1 = bbox[1] / img_height
                x2 = bbox[2] / img_width
                y2 = bbox[3] / img_height
                
                # Dish index from label
                dish_index = None
                label = det.get('label', '')
                if 'dish_' in label:
                    try:
                        dish_index = int(label.split('_')[1])
                    except:
                        pass
                
                annotations_data.append({
                    'recognition_id': rec_id,
                    'image_type': image_type,
                    'storage_path': storage_path,
                    'object_type': 'dish',
                    'dish_index': dish_index,
                    'bbox_x1': x1,
                    'bbox_y1': y1,
                    'bbox_x2': x2,
                    'bbox_y2': y2,
                    'source': 'qwen_auto'
                })
            
            # Plates
            plates_data = qwen.get('plates', {})
            plate_detections = plates_data.get('qwen_detections', [])
            for det in plate_detections:
                bbox = det.get('bbox_2d', [])
                if len(bbox) != 4:
                    continue
                
                x1 = bbox[0] / img_width
                y1 = bbox[1] / img_height
                x2 = bbox[2] / img_width
                y2 = bbox[3] / img_height
                
                annotations_data.append({
                    'recognition_id': rec_id,
                    'image_type': image_type,
                    'storage_path': storage_path,
                    'object_type': 'plate',
                    'dish_index': None,
                    'bbox_x1': x1,
                    'bbox_y1': y1,
                    'bbox_x2': x2,
                    'bbox_y2': y2,
                    'source': 'qwen_auto'
                })
    
    print(f"✅ Prepared:")
    print(f"   {len(recognitions)} recognitions")
    print(f"   {len(images_data)} images")
    print(f"   {len(annotations_data)} annotations")
    
    # 4. Insert recognitions (COPY)
    print("\n📝 Inserting recognitions...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    
    with conn.cursor() as cur:
        cur.execute("DELETE FROM recognitions")
        print(f"   Deleted {cur.rowcount} old recognitions")
    
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer)
    
    for rec in recognitions:
        csv_writer.writerow([
            rec['recognition_id'],
            rec['recognition_date'],
            json.dumps(rec['correct_dishes']),
            json.dumps(rec['menu_all'])
        ])
    
    csv_buffer.seek(0)
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """COPY recognitions (recognition_id, recognition_date, correct_dishes, menu_all)
               FROM STDIN WITH (FORMAT CSV)""",
            csv_buffer
        )
    
    print(f"✅ Inserted {len(recognitions)} recognitions")
    
    # 5. Upload images to storage
    if not skip_storage:
        print(f"\n📤 Uploading {len(images_data)} images to storage...")
        
        def upload_image(img_data):
            try:
                with open(img_data['local_path'], 'rb') as f:
                    supabase.storage.from_('recognition-images').upload(
                        img_data['storage_path'],
                        f,
                        {'content-type': 'image/jpeg', 'upsert': 'true'}
                    )
                return True
            except Exception as e:
                print(f"⚠️  Upload failed: {img_data['storage_path']}: {e}")
                return False
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(upload_image, img) for img in images_data]
            
            uploaded = 0
            for future in tqdm(as_completed(futures), total=len(futures), desc="Uploading"):
                if future.result():
                    uploaded += 1
        
        print(f"✅ Uploaded {uploaded}/{len(images_data)} images")
    else:
        print("\n⏭️  Skipping storage upload")
    
    # 6. Insert images (COPY)
    print("\n📝 Inserting images...")
    
    with conn.cursor() as cur:
        cur.execute("DELETE FROM images")
        print(f"   Deleted {cur.rowcount} old images")
    
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer)
    
    for img in images_data:
        csv_writer.writerow([
            img['recognition_id'],
            img['image_type'],
            img['storage_path'],
            img['width'],
            img['height'],
            json.dumps(img['original_annotations'])
        ])
    
    csv_buffer.seek(0)
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """COPY images (recognition_id, image_type, storage_path, width, height, original_annotations)
               FROM STDIN WITH (FORMAT CSV)""",
            csv_buffer
        )
    
    print(f"✅ Inserted {len(images_data)} images")
    
    # 7. Get image IDs
    print("\n🔗 Mapping image IDs...")
    storage_to_id = {}
    
    with conn.cursor() as cur:
        cur.execute("SELECT id, storage_path FROM images")
        for row in cur.fetchall():
            storage_to_id[row[1]] = row[0]
    
    print(f"✅ Mapped {len(storage_to_id)} images")
    
    # 8. Insert annotations (COPY)
    print("\n📝 Inserting annotations...")
    
    with conn.cursor() as cur:
        cur.execute("DELETE FROM annotations")
        print(f"   Deleted {cur.rowcount} old annotations")
    
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer)
    
    for ann in annotations_data:
        image_id = storage_to_id.get(ann['storage_path'])
        if not image_id:
            continue
        
        csv_writer.writerow([
            image_id,
            ann['bbox_x1'],
            ann['bbox_y1'],
            ann['bbox_x2'],
            ann['bbox_y2'],
            ann['object_type'],
            ann['dish_index'] if ann['dish_index'] is not None else '',
            ann['source'],
            False  # is_deleted
        ])
    
    csv_buffer.seek(0)
    
    with conn.cursor() as cur:
        cur.copy_expert(
            """COPY annotations (image_id, bbox_x1, bbox_y1, bbox_x2, bbox_y2, object_type, dish_index, source, is_deleted)
               FROM STDIN WITH (FORMAT CSV, NULL '')""",
            csv_buffer
        )
    
    print(f"✅ Inserted annotations")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ IMPORT COMPLETE!")
    print("=" * 60)
    print(f"📊 Imported {len(recognitions)} recognitions with {len(images_data)} images")
    print("\nNext steps:")
    print("  1. Create tasks: python3 scripts/assign_test_tasks.py")
    print("  2. Start dev server: npm run dev")

if __name__ == "__main__":
    main()

