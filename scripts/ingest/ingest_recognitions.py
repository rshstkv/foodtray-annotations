#!/usr/bin/env python3
"""
Ingest recognitions from RRS_Dataset 2 directory
- Uploads images to Supabase Storage
- Loads raw.recognition_files with active menu (AM.json)
- Loads raw.correct_dishes
- Calls transform functions
"""
import os
import sys
import json
import argparse
from pathlib import Path
from tqdm import tqdm
from PIL import Image

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))
from shared import (
    load_env, get_supabase_client, get_db_connection,
    log, copy_to_table, validate_env
)


def get_dataset_path():
    """Get path to RRS_Dataset 2"""
    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent.parent.parent / "RRS_Dataset 2",
        Path.home() / "Downloads" / "RRS_Dataset 2",
        Path.home() / "RRS_Dataset 2",
    ]
    
    for dataset_path in possible_paths:
        if dataset_path.exists():
            return dataset_path
    
    log(f"Dataset not found. Tried locations:", "ERROR")
    for p in possible_paths:
        log(f"  - {p}", "ERROR")
    sys.exit(1)


def process_recognition_dir(recognition_dir: Path, supabase_client, limit: int = None):
    """
    Process a single recognition directory
    Returns tuple: (recognition_id, batch_id, active_menu, image1_path, image2_path, correct_dishes)
    """
    # Extract recognition_id from directory name (e.g., "recognition_100024" -> 100024)
    dir_name = recognition_dir.name
    if dir_name.startswith('recognition_'):
        recognition_id = int(dir_name.replace('recognition_', ''))
    else:
        recognition_id = int(dir_name)
    
    # Read active menu (AM.json or {id}_recognition_*_AM.json)
    am_files = list(recognition_dir.glob("*_AM.json")) + list(recognition_dir.glob("AM.json"))
    active_menu = None
    if am_files:
        with open(am_files[0], 'r', encoding='utf-8') as f:
            active_menu = json.load(f)
    
    # Read recipe (CD.json or {id}_recognition_*_correct_dishes.json)
    recipe_files = list(recognition_dir.glob("*_correct_dishes.json")) + list(recognition_dir.glob("CD.json"))
    recipe = None
    if recipe_files:
        with open(recipe_files[0], 'r', encoding='utf-8') as f:
            recipe = json.load(f)
    
    # Find image files (in photos/ subdirectory or in root)
    photos_dir = recognition_dir / "photos"
    if photos_dir.exists():
        image_files = list(photos_dir.glob("*.jpg")) + list(photos_dir.glob("*.jpeg"))
    else:
        image_files = list(recognition_dir.glob("*.jpg")) + list(recognition_dir.glob("*.jpeg"))
    
    if len(image_files) != 2:
        log(f"Recognition {recognition_id}: Expected 2 images, found {len(image_files)}", "WARNING")
        return None
    
    # Sort images to ensure consistent camera1/camera2 assignment
    image_files.sort()
    
    # Upload images to storage
    uploaded_paths = []
    for idx, img_path in enumerate(image_files, start=1):
        camera_num = idx
        storage_path = f"recognitions/{recognition_id}/camera{camera_num}.jpg"
        
        try:
            # Check if file already exists
            try:
                supabase_client.storage().from_('rrs-photos').list(path=f"recognitions/{recognition_id}")
                # File exists, skip upload
                uploaded_paths.append(f"camera{camera_num}.jpg")
                continue
            except:
                pass
            
            # Read and potentially resize image
            with Image.open(img_path) as img:
                # Convert to RGB if needed
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Save to temp buffer
                import io
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                buffer.seek(0)
                
                # Upload to Supabase Storage
                supabase_client.storage().from_('rrs-photos').upload(
                    path=storage_path,
                    file=buffer.getvalue(),
                    file_options={"content-type": "image/jpeg"}
                )
                
                uploaded_paths.append(f"camera{camera_num}.jpg")
        
        except Exception as e:
            # If duplicate, it's OK - file already there
            if 'Duplicate' in str(e) or 'already exists' in str(e):
                uploaded_paths.append(f"camera{camera_num}.jpg")
            else:
                log(f"Failed to upload {img_path.name}: {e}", "ERROR")
                return None
    
    if len(uploaded_paths) != 2:
        return None
    
    return (
        recognition_id,
        "manual_load",  # batch_id
        json.dumps(active_menu) if active_menu else None,
        uploaded_paths[0],
        uploaded_paths[1],
        recipe
    )


def main():
    parser = argparse.ArgumentParser(description='Ingest recognitions from RRS_Dataset 2')
    parser.add_argument('--limit', type=int, default=50, help='Limit number of recognitions to process (default: 50 for testing)')
    args = parser.parse_args()
    
    # Load environment
    load_env()
    validate_env()
    
    log("Starting recognition ingestion", "INFO")
    
    # Get dataset path
    dataset_path = get_dataset_path()
    log(f"Dataset path: {dataset_path}", "INFO")
    
    # Get all recognition directories (check if there's an export subdirectory)
    recognition_dirs = []
    
    # Check for export_* subdirectories first
    export_dirs = sorted([d for d in dataset_path.iterdir() if d.is_dir() and d.name.startswith('export_')])
    if export_dirs:
        log(f"Found export directory: {export_dirs[0].name}", "INFO")
        recognition_dirs = sorted([d for d in export_dirs[0].iterdir() if d.is_dir() and d.name.startswith('recognition_')])
    else:
        # Try direct recognition_* directories
        recognition_dirs = sorted([d for d in dataset_path.iterdir() if d.is_dir() and (d.name.isdigit() or d.name.startswith('recognition_'))])
    
    if args.limit:
        recognition_dirs = recognition_dirs[:args.limit]
        log(f"Processing {len(recognition_dirs)} recognitions (limited)", "INFO")
    else:
        log(f"Processing {len(recognition_dirs)} recognitions", "INFO")
    
    # Initialize clients
    supabase = get_supabase_client()
    conn = get_db_connection()
    
    # Process recognitions
    recognition_rows = []
    recipe_rows = []
    
    log("Processing recognition directories...", "INFO")
    for rec_dir in tqdm(recognition_dirs, desc="Processing"):
        result = process_recognition_dir(rec_dir, supabase, args.limit)
        
        if result:
            recognition_id, batch_id, active_menu, img1, img2, recipe = result
            
            recognition_rows.append((
                recognition_id,
                batch_id,
                active_menu,
                img1,
                img2
            ))
            
            if recipe:
                recipe_rows.append((
                    recognition_id,
                    json.dumps(recipe)
                ))
    
    log(f"Processed {len(recognition_rows)} recognitions successfully", "SUCCESS")
    
    # Insert into raw tables
    if recognition_rows:
        log("Inserting into raw.recognition_files...", "INFO")
        copy_to_table(
            conn,
            "raw.recognition_files",
            ["recognition_id", "batch_id", "active_menu", "image1_path", "image2_path"],
            recognition_rows
        )
    
    if recipe_rows:
        log("Inserting into raw.recipes...", "INFO")
        copy_to_table(
            conn,
            "raw.recipes",
            ["recognition_id", "payload"],
            recipe_rows
        )
    
    # Transform raw data to domain model
    log("Transforming recognitions and images...", "INFO")
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM transform_recognitions_and_images()")
        rec_count, img_count, menu_count = cur.fetchone()
        log(f"Created {rec_count} recognitions, {img_count} images, {menu_count} active menu items", "SUCCESS")
    
    log("Transforming recipes...", "INFO")
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM transform_recipes()")
        rec_count, line_count, opt_count = cur.fetchone()
        log(f"Created {rec_count} recipes, {line_count} lines, {opt_count} options", "SUCCESS")
    
    conn.close()
    log("Recognition ingestion complete!", "SUCCESS")


if __name__ == "__main__":
    main()
