#!/usr/bin/env python3
"""
Export validated data from database directly
Usage: 
  # Using environment files:
  python scripts/export_validated.py --env production --output export.json
  python scripts/export_validated.py --env staging --output export.json
  
  # Or using environment variable:
  export SUPABASE_DB_URL="postgresql://..."
  python scripts/export_validated.py --output export.json
"""

import os
import json
import argparse
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

def load_database_url(env_name=None):
    """Load DATABASE_URL from .env.{env_name} file or environment"""
    # First check if already in environment
    db_url = os.environ.get('SUPABASE_DB_URL') or os.environ.get('DATABASE_URL')
    
    if env_name and not db_url:
        # Load from .env.{env_name} file
        env_file = f'.env.{env_name}'
        if not os.path.exists(env_file):
            raise ValueError(f"Environment file {env_file} not found")
        
        print(f"[export] Loading database URL from {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('DATABASE_URL=', 1)[1].strip()
                    # Remove quotes if present
                    db_url = db_url.strip('"').strip("'")
                    break
    
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment or .env file")
    
    return db_url

def get_db_connection(env_name=None):
    """Get database connection from environment"""
    db_url = load_database_url(env_name)
    print(f"[export] Connecting to database...")
    return psycopg2.connect(db_url, cursor_factory=RealDictCursor)

def get_completed_work_logs(conn, user_emails=None, step_food=None, step_plate=None, step_buzzer=None):
    """Get all completed work logs with filters"""
    print(f"[export] Fetching completed work logs...")
    
    cursor = conn.cursor()
    
    query = """
        SELECT DISTINCT ON (vwl.recognition_id)
            vwl.recognition_id,
            vwl.id as work_log_id,
            vwl.validation_steps,
            vwl.assigned_to,
            vwl.completed_at,
            r.batch_id,
            p.email as assigned_to_email
        FROM validation_work_log vwl
        JOIN profiles p ON p.id = vwl.assigned_to
        LEFT JOIN recognitions r ON r.id = vwl.recognition_id
        WHERE vwl.status = 'completed'
    """
    
    params = []
    if user_emails:
        query += " AND p.email = ANY(%s)"
        params.append(user_emails)
    
    # Filter by validation steps
    if step_food and step_food != 'any':
        query += """ AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(vwl.validation_steps) as step
            WHERE step->>'type' = 'FOOD_VALIDATION' AND step->>'status' = %s
        )"""
        params.append(step_food)
    
    if step_plate and step_plate != 'any':
        query += """ AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(vwl.validation_steps) as step
            WHERE step->>'type' = 'PLATE_VALIDATION' AND step->>'status' = %s
        )"""
        params.append(step_plate)
    
    if step_buzzer and step_buzzer != 'any':
        query += """ AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(vwl.validation_steps) as step
            WHERE step->>'type' = 'BUZZER_VALIDATION' AND step->>'status' = %s
        )"""
        params.append(step_buzzer)
    
    query += " ORDER BY vwl.recognition_id, vwl.completed_at DESC"
    
    cursor.execute(query, params)
    work_logs = cursor.fetchall()
    cursor.close()
    
    print(f"[export] Found {len(work_logs)} completed work logs")
    return work_logs

def get_work_items(conn, work_log_ids):
    """Get all work items for given work_log_ids"""
    print(f"[export] Fetching work items for {len(work_log_ids)} work logs...")
    
    cursor = conn.cursor()
    
    query = """
        SELECT 
            wi.id,
            wi.work_log_id,
            wi.recognition_id,
            wi.type,
            wi.quantity,
            wi.bottle_orientation,
            wi.metadata,
            wi.recipe_line_id,
            rlo.external_id,
            rlo.name,
            rlo.is_selected
        FROM work_items wi
        LEFT JOIN recipe_line_options rlo ON rlo.recipe_line_id = wi.recipe_line_id
            AND (rlo.is_selected = true OR rlo.id = (
                SELECT MIN(id) FROM recipe_line_options 
                WHERE recipe_line_id = wi.recipe_line_id
            ))
        WHERE wi.work_log_id = ANY(%s)
            AND wi.is_deleted = false
        ORDER BY wi.id
    """
    
    cursor.execute(query, (work_log_ids,))
    items = cursor.fetchall()
    cursor.close()
    
    print(f"[export] Found {len(items)} work items")
    return items

def get_work_annotations(conn, work_log_ids):
    """Get all work annotations for given work_log_ids"""
    print(f"[export] Fetching work annotations...")
    
    cursor = conn.cursor()
    
    query = """
        SELECT 
            wa.id,
            wa.work_log_id,
            wa.work_item_id,
            wa.image_id,
            wa.bbox,
            wa.is_occluded,
            wa.occlusion_metadata,
            ia.bbox as initial_bbox
        FROM work_annotations wa
        LEFT JOIN initial_annotations ia ON ia.id = wa.initial_annotation_id
        WHERE wa.work_log_id = ANY(%s)
            AND wa.is_deleted = false
        ORDER BY wa.id
    """
    
    cursor.execute(query, (work_log_ids,))
    annotations = cursor.fetchall()
    cursor.close()
    
    print(f"[export] Found {len(annotations)} work annotations")
    return annotations

def get_images(conn, recognition_ids):
    """Get all images for given recognition_ids"""
    print(f"[export] Fetching images for {len(recognition_ids)} recognitions...")
    
    cursor = conn.cursor()
    
    query = """
        SELECT 
            id,
            recognition_id,
            camera_number,
            storage_path,
            width,
            height
        FROM images
        WHERE recognition_id = ANY(%s)
        ORDER BY recognition_id, camera_number
    """
    
    cursor.execute(query, (recognition_ids,))
    images = cursor.fetchall()
    cursor.close()
    
    print(f"[export] Found {len(images)} images")
    return images

def bbox_equals(bbox1, bbox2):
    """Compare two bboxes"""
    if not bbox1 or not bbox2:
        return False
    return (bbox1.get('x') == bbox2.get('x') and 
            bbox1.get('y') == bbox2.get('y') and
            bbox1.get('w') == bbox2.get('w') and
            bbox1.get('h') == bbox2.get('h'))

def build_export_data(work_logs, items, annotations, images):
    """Build export JSON structure"""
    print(f"[export] Building export data structure...")
    
    # Group data by recognition_id and work_log_id
    items_by_wl = {}
    for item in items:
        wl_id = item['work_log_id']
        if wl_id not in items_by_wl:
            items_by_wl[wl_id] = []
        items_by_wl[wl_id].append(item)
    
    annotations_by_image = {}
    for ann in annotations:
        img_id = ann['image_id']
        if img_id not in annotations_by_image:
            annotations_by_image[img_id] = []
        annotations_by_image[img_id].append(ann)
    
    images_by_recognition = {}
    for img in images:
        rec_id = img['recognition_id']
        if rec_id not in images_by_recognition:
            images_by_recognition[rec_id] = []
        images_by_recognition[rec_id].append(img)
    
    # Build recognitions
    recognitions = []
    for wl in work_logs:
        rec_id = wl['recognition_id']
        wl_id = wl['work_log_id']
        
        # Build items for this recognition
        export_items = []
        for item in items_by_wl.get(wl_id, []):
            export_items.append({
                'item_id': item['id'],
                'item_type': item['type'],
                'external_id': item.get('external_id'),
                'name': item.get('name'),
                'quantity': item['quantity'],
                'bottle_orientation': item.get('bottle_orientation'),
                'metadata': item.get('metadata'),
            })
        
        # Build images with annotations
        export_images = []
        for img in images_by_recognition.get(rec_id, []):
            img_annotations = []
            for ann in annotations_by_image.get(img['id'], []):
                initial_bbox = ann.get('initial_bbox')
                current_bbox = ann['bbox']
                was_modified = not bbox_equals(current_bbox, initial_bbox) if initial_bbox else False
                
                img_annotations.append({
                    'item_id': ann['work_item_id'],
                    'bbox': current_bbox,
                    'is_occluded': ann.get('is_occluded', False),
                    'occlusion_metadata': ann.get('occlusion_metadata'),
                    'was_modified': was_modified,
                    'original_bbox': initial_bbox if was_modified else None,
                })
            
            export_images.append({
                'camera_number': img['camera_number'],
                'image_name': 'Main' if img['camera_number'] == 1 else 'Qualifying',
                'storage_path': img['storage_path'],
                'width': img.get('width'),
                'height': img.get('height'),
                'annotations': img_annotations,
            })
        
        # Build validation steps
        validation_steps = []
        if wl.get('validation_steps'):
            for step in wl['validation_steps']:
                validation_steps.append({
                    'type': step.get('type'),
                    'status': step.get('status'),
                    'order': step.get('order'),
                })
        
        recognitions.append({
            'recognition_id': rec_id,
            'batch_id': wl.get('batch_id'),
            'validation_metadata': {
                'work_log_id': wl_id,
                'assigned_to': str(wl['assigned_to']),
                'assigned_to_email': wl['assigned_to_email'],
                'completed_at': wl['completed_at'].isoformat() if wl.get('completed_at') else None,
                'validation_steps': validation_steps,
            },
            'recipe': {
                'items': export_items,
            },
            'images': export_images,
        })
    
    return {'recognitions': recognitions}

def main():
    parser = argparse.ArgumentParser(description='Export validated data from database')
    parser.add_argument('--env', choices=['production', 'staging'], help='Environment (reads from .env.production or .env.staging)')
    parser.add_argument('--output', help='Output JSON file path (default: ~/Downloads/export_TIMESTAMP.json)')
    parser.add_argument('--emails', help='Comma-separated list of user emails to filter')
    parser.add_argument('--step-food', choices=['completed', 'skipped', 'any'], help='Filter by FOOD_VALIDATION status')
    parser.add_argument('--step-plate', choices=['completed', 'skipped', 'any'], help='Filter by PLATE_VALIDATION status')
    parser.add_argument('--step-buzzer', choices=['completed', 'skipped', 'any'], help='Filter by BUZZER_VALIDATION status')
    
    args = parser.parse_args()
    
    # Set default output path
    if not args.output:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        env_suffix = f"_{args.env}" if args.env else ""
        args.output = os.path.expanduser(f"~/Downloads/export{env_suffix}_{timestamp}.json")
    
    # Parse filters
    user_emails = args.emails.split(',') if args.emails else None
    
    print(f"[export] ========================================")
    print(f"[export] Starting export")
    if args.env:
        print(f"[export] Environment: {args.env}")
    print(f"[export] User filter: {user_emails or 'All users'}")
    if args.step_food:
        print(f"[export] FOOD_VALIDATION: {args.step_food}")
    if args.step_plate:
        print(f"[export] PLATE_VALIDATION: {args.step_plate}")
    if args.step_buzzer:
        print(f"[export] BUZZER_VALIDATION: {args.step_buzzer}")
    print(f"[export] ========================================")
    
    try:
        # Connect to database
        conn = get_db_connection(args.env)
        
        # Step 1: Get work logs
        work_logs = get_completed_work_logs(
            conn, 
            user_emails,
            step_food=args.step_food,
            step_plate=args.step_plate,
            step_buzzer=args.step_buzzer
        )
        
        if not work_logs:
            print("[export] No completed work logs found")
            return
        
        work_log_ids = [wl['work_log_id'] for wl in work_logs]
        recognition_ids = [wl['recognition_id'] for wl in work_logs]
        
        # Step 2: Get items
        items = get_work_items(conn, work_log_ids)
        
        # Step 3: Get annotations
        annotations = get_work_annotations(conn, work_log_ids)
        
        # Step 4: Get images
        images = get_images(conn, recognition_ids)
        
        # Step 5: Build export structure
        export_data = build_export_data(work_logs, items, annotations, images)
        
        # Save to file
        print(f"[export] Saving to {args.output}...")
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        print(f"[export] ========================================")
        print(f"[export] ✅ Export complete!")
        print(f"[export]   Total recognitions: {len(export_data['recognitions'])}")
        print(f"[export]   Output file: {args.output}")
        print(f"[export] ========================================")
        
        conn.close()
        
    except Exception as e:
        print(f"[export] ❌ Error: {e}")
        raise

if __name__ == '__main__':
    main()
