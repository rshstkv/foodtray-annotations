#!/usr/bin/env python3
"""
Ingest Qwen annotations from qwen_annotations.json
- Filters by existing recognition_ids in database
- Loads into raw.qwen_annotations
- Calls transform_items_and_annotations()
"""
import os
import sys
import json
from pathlib import Path
from tqdm import tqdm

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))
from shared import (
    load_env, get_db_connection,
    log, copy_to_table, validate_env
)


def get_qwen_annotations_path():
    """Get path to qwen_annotations.json"""
    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent.parent.parent / "qwen_annotations.json",
        Path.home() / "Downloads" / "qwen_annotations.json",
        Path.home() / "qwen_annotations.json",
    ]
    
    for qwen_path in possible_paths:
        if qwen_path.exists():
            return qwen_path
    
    log(f"qwen_annotations.json not found. Tried locations:", "ERROR")
    for p in possible_paths:
        log(f"  - {p}", "ERROR")
    sys.exit(1)


def load_existing_recognitions(conn):
    """Get set of recognition_ids that already exist in database"""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM recognitions")
        return set(row[0] for row in cur.fetchall())


def main():
    # Load environment
    load_env()
    validate_env()
    
    log("Starting Qwen annotations ingestion", "INFO")
    
    # Get database connection
    conn = get_db_connection()
    
    # Load existing recognitions
    log("Loading existing recognition IDs...", "INFO")
    existing_recognitions = load_existing_recognitions(conn)
    log(f"Found {len(existing_recognitions)} existing recognitions", "INFO")
    
    if not existing_recognitions:
        log("No recognitions found in database. Run ingest_recognitions.py first.", "ERROR")
        sys.exit(1)
    
    # Load and filter Qwen annotations efficiently
    qwen_path = get_qwen_annotations_path()
    log(f"Loading Qwen annotations from {qwen_path.name}...", "INFO")
    
    with open(qwen_path, 'r', encoding='utf-8') as f:
        qwen_data = json.load(f)
    
    log(f"Loaded annotations for {len(qwen_data)} images", "INFO")
    
    # Prepare rows for insertion
    annotation_rows = []
    processed_count = 0
    skipped_count = 0
    
    for image_path, data in tqdm(qwen_data.items(), desc="Processing Qwen annotations"):
        # Extract recognition_id from path: "data/recognition_100024/photos/..."
        import re
        match = re.search(r'recognition_(\d+)', image_path)
        if not match:
            continue
        
        recognition_id = int(match.group(1))
        
        # Skip if recognition not in database
        if recognition_id not in existing_recognitions:
            skipped_count += 1
            continue
        
        processed_count += 1
        
        # Get detections from both dishes and plates
        all_detections = []
        
        # Dishes (FOOD items)
        dishes = data.get('dishes', {})
        for detection in dishes.get('qwen_detections', []):
            all_detections.append(('FOOD', detection))
        
        # Plates (PLATE items)
        plates = data.get('plates', {})
        for detection in plates.get('qwen_detections', []):
            all_detections.append(('PLATE', detection))
        
        for item_type, detection in all_detections:
            bbox_2d = detection.get('bbox_2d', [])
            label = detection.get('label', '')
            
            # Convert bbox to JSONB format {x, y, w, h}
            if len(bbox_2d) == 4:
                bbox_json = json.dumps({
                    'x': bbox_2d[0],
                    'y': bbox_2d[1],
                    'w': bbox_2d[2] - bbox_2d[0],
                    'h': bbox_2d[3] - bbox_2d[1]
                })
            else:
                continue
            
            # Determine camera number from path
            camera_path = 'camera1.jpg' if 'Main' in image_path else 'camera2.jpg'
            
            annotation_rows.append((
                recognition_id,
                camera_path,
                bbox_json,
                label,
                item_type,  # FOOD or PLATE
                None  # external_id (нет в Qwen данных)
            ))
    
    log(f"Processed {processed_count} recognitions, skipped {skipped_count}", "INFO")
    
    log(f"Prepared {len(annotation_rows)} annotation rows", "SUCCESS")
    
    # Insert into raw.qwen_annotations
    if annotation_rows:
        log("Inserting into raw.qwen_annotations...", "INFO")
        copy_to_table(
            conn,
            "raw.qwen_annotations",
            ["recognition_id", "image_path", "bbox", "class_name", "item_type", "external_id"],
            annotation_rows
        )
    
    # Transform to domain model
    log("Transforming initial items and annotations...", "INFO")
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM transform_initial_items_and_annotations()")
        item_count, ann_count = cur.fetchone()
        log(f"Created {item_count} initial items and {ann_count} initial annotations", "SUCCESS")
    
    conn.close()
    log("Qwen annotations ingestion complete!", "SUCCESS")


if __name__ == "__main__":
    main()
