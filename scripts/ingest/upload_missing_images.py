#!/usr/bin/env python3
"""
Upload missing images to Supabase Storage for existing recognitions
Finds images in dataset and uploads them to match existing DB records
"""
import os
import sys
from pathlib import Path
from tqdm import tqdm
from PIL import Image
import io

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))
from shared import load_env, get_supabase_client, get_db_connection, log, validate_env


def get_dataset_path():
    """Get path to RRS_Dataset 2"""
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


def find_recognition_images(dataset_path: Path, recognition_id: int):
    """Find images for a recognition in the dataset"""
    # Try different possible locations
    recognition_dirs = [
        dataset_path / f"recognition_{recognition_id}",
        dataset_path / str(recognition_id),
    ]
    
    # Check export directories
    export_dirs = sorted([d for d in dataset_path.iterdir() 
                         if d.is_dir() and d.name.startswith('export_')])
    if export_dirs:
        recognition_dirs.extend([
            export_dirs[0] / f"recognition_{recognition_id}",
            export_dirs[0] / str(recognition_id),
        ])
    
    for rec_dir in recognition_dirs:
        if not rec_dir.exists():
            continue
        
        # Look for images in photos/ subdirectory or root
        photos_dir = rec_dir / "photos"
        if photos_dir.exists():
            image_files = list(photos_dir.glob("*.jpg")) + list(photos_dir.glob("*.jpeg"))
        else:
            image_files = list(rec_dir.glob("*.jpg")) + list(rec_dir.glob("*.jpeg"))
        
        if len(image_files) == 2:
            image_files.sort()
            return image_files
    
    return None


def upload_image(supabase_client, image_path: Path, storage_path: str):
    """Upload an image to Supabase Storage"""
    try:
        # Check if file already exists
        try:
            # Try to get file info - if it succeeds, file exists
            recognition_id = storage_path.split('/')[1]
            objects = supabase_client.storage.from_('rrs-photos').list(f"recognitions/{recognition_id}")
            # If we got here and have objects, file might exist
            if objects:
                for obj in objects:
                    if obj['name'] in storage_path:
                        return True  # File exists, skip
        except Exception:
            pass  # File doesn't exist, proceed with upload
        
        # Read and process image
        with Image.open(image_path) as img:
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Save to buffer
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85)
            buffer.seek(0)
            
            # Upload to Supabase Storage
            supabase_client.storage.from_('rrs-photos').upload(
                path=storage_path,
                file=buffer.getvalue(),
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            return True
    
    except Exception as e:
        if 'Duplicate' in str(e) or 'already exists' in str(e):
            return True  # File exists, OK
        log(f"Failed to upload {image_path.name}: {e}", "ERROR")
        return False


def main():
    # Load environment
    load_env()
    validate_env()
    
    log("Starting image upload for existing recognitions", "INFO")
    
    # Get dataset path
    dataset_path = get_dataset_path()
    log(f"Dataset path: {dataset_path}", "INFO")
    
    # Initialize clients
    supabase = get_supabase_client()
    conn = get_db_connection()
    
    # Get all recognitions from DB
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT r.id 
            FROM recognitions r
            ORDER BY r.id
        """)
        recognition_ids = [row[0] for row in cur.fetchall()]
    
    log(f"Found {len(recognition_ids)} recognitions in database", "INFO")
    
    # Check how many images are in storage
    try:
        objects = supabase.storage.from_('rrs-photos').list('recognitions')
        existing_count = len([obj for obj in objects if obj.get('name')])
    except:
        existing_count = 0
    
    log(f"Currently {existing_count} directories in storage", "INFO")
    
    # Upload images
    uploaded_count = 0
    skipped_count = 0
    missing_count = 0
    
    for recognition_id in tqdm(recognition_ids, desc="Uploading images"):
        # Find images in dataset
        image_files = find_recognition_images(dataset_path, recognition_id)
        
        if not image_files:
            missing_count += 1
            continue
        
        # Upload both images
        success = True
        for idx, img_path in enumerate(image_files, start=1):
            storage_path = f"recognitions/{recognition_id}/camera{idx}.jpg"
            if upload_image(supabase, img_path, storage_path):
                if idx == 2:  # Both images uploaded
                    uploaded_count += 1
            else:
                success = False
                break
        
        if not success:
            skipped_count += 1
    
    log(f"Upload complete:", "SUCCESS")
    log(f"  - Uploaded: {uploaded_count} recognitions", "SUCCESS")
    log(f"  - Skipped: {skipped_count} recognitions (errors)", "WARNING")
    log(f"  - Missing: {missing_count} recognitions (not found in dataset)", "WARNING")
    
    # Verify storage count
    try:
        objects = supabase.storage.from_('rrs-photos').list('recognitions')
        final_count = len([obj for obj in objects if obj.get('name')])
        log(f"Final storage count: {final_count} directories", "INFO")
    except Exception as e:
        log(f"Could not verify final count: {e}", "WARNING")
    
    conn.close()


if __name__ == "__main__":
    main()


