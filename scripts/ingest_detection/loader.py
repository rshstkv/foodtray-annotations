"""
Core loader for food-plate detection datasets.
Scans a local folder, uploads images to Supabase Storage,
and inserts records into detection_tasks / detection_image_tasks.
"""
import json
import mimetypes
from pathlib import Path
from typing import List, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
from supabase import create_client, Client
from PIL import Image
from tqdm import tqdm

from ingest.config import IngestConfig

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
STORAGE_BUCKET = 'detection-images'


def parse_yolo_file(txt_path: Path) -> list:
    """Parse a YOLO annotation .txt file into a list of dicts."""
    annotations = []
    try:
        text = txt_path.read_text().strip()
        if not text:
            return annotations
        for line in text.splitlines():
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            annotations.append({
                "class": int(parts[0]),
                "x_center": float(parts[1]),
                "y_center": float(parts[2]),
                "width": float(parts[3]),
                "height": float(parts[4]),
            })
    except Exception as e:
        print(f"  Warning: failed to parse {txt_path}: {e}")
    return annotations


def scan_folder(source_dir: Path) -> List[dict]:
    """
    Scan folder for image + annotation pairs.
    Returns list of dicts with keys: image_path, txt_path (optional), filename.
    """
    items = []
    image_files = sorted(
        f for f in source_dir.rglob('*')
        if f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith('.')
    )

    for img_path in image_files:
        txt_path = img_path.with_suffix('.txt')
        items.append({
            'image_path': img_path,
            'txt_path': txt_path if txt_path.is_file() else None,
            'filename': img_path.name,
        })

    return items


class DetectionLoader:
    def __init__(self, config: IngestConfig):
        self.config = config
        self.supabase: Client = create_client(config.supabase_url, config.supabase_key)

    def _ensure_bucket(self):
        """Create storage bucket if it doesn't exist."""
        try:
            self.supabase.storage.from_(STORAGE_BUCKET).list("")
        except Exception:
            try:
                self.supabase.storage.create_bucket(STORAGE_BUCKET, options={"public": True})
                print(f"  Created storage bucket: {STORAGE_BUCKET}")
            except Exception as e:
                if "already exists" not in str(e).lower():
                    raise

    def _upload_image(self, image_path: Path, storage_path: str) -> bool:
        """Upload a single image to Supabase Storage."""
        content_type = mimetypes.guess_type(str(image_path))[0] or 'image/jpeg'
        data = image_path.read_bytes()
        try:
            self.supabase.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=data,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            return True
        except Exception as e:
            if "Duplicate" in str(e) or "already exists" in str(e):
                return True
            print(f"  Upload failed for {storage_path}: {e}")
            return False

    def _get_image_dimensions(self, image_path: Path) -> Tuple[Optional[int], Optional[int]]:
        """Read image width and height using Pillow."""
        try:
            with Image.open(image_path) as img:
                return img.size  # (width, height)
        except Exception:
            return None, None

    def load(self, source_dir: Path, bucket_name: str):
        """Main load routine: scan, upload, insert."""
        print("Scanning folder...")
        items = scan_folder(source_dir)
        if not items:
            print("No images found.")
            return

        print(f"Found {len(items)} images")
        print()

        self._ensure_bucket()

        # Phase 1: upload images
        print("Uploading images to Supabase Storage...")
        upload_results = {}
        max_workers = min(self.config.thread_count, 8)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for item in items:
                storage_path = f"{bucket_name}/{item['filename']}"
                future = executor.submit(self._upload_image, item['image_path'], storage_path)
                futures[future] = item['filename']

            for future in tqdm(as_completed(futures), total=len(futures), desc="Upload"):
                fname = futures[future]
                try:
                    upload_results[fname] = future.result()
                except Exception as e:
                    print(f"  Error uploading {fname}: {e}")
                    upload_results[fname] = False

        uploaded_count = sum(1 for v in upload_results.values() if v)
        print(f"Uploaded: {uploaded_count}/{len(items)}")
        print()

        # Phase 2: read dimensions + parse annotations
        print("Reading image dimensions and annotations...")
        records = []
        for item in tqdm(items, desc="Process"):
            if not upload_results.get(item['filename'], False):
                continue

            width, height = self._get_image_dimensions(item['image_path'])
            annotations = parse_yolo_file(item['txt_path']) if item['txt_path'] else []
            storage_path = f"{bucket_name}/{item['filename']}"

            records.append({
                'image_filename': item['filename'],
                'storage_path': storage_path,
                'image_width': width,
                'image_height': height,
                'original_annotations': json.dumps(annotations),
            })

        print(f"Prepared {len(records)} records")
        print()

        # Phase 3: insert into DB
        print("Inserting into database...")
        conn = psycopg2.connect(self.config.database_url)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO detection_tasks (bucket_name, images_count)
                    VALUES (%s, %s)
                    RETURNING id
                    """,
                    (bucket_name, len(records))
                )
                task_id = cur.fetchone()[0]
                print(f"  Created detection_task id={task_id}")

                batch_size = 100
                for i in range(0, len(records), batch_size):
                    batch = records[i:i + batch_size]
                    args = []
                    for r in batch:
                        args.append((
                            task_id,
                            r['image_filename'],
                            r['storage_path'],
                            r['image_width'],
                            r['image_height'],
                            r['original_annotations'],
                        ))

                    values_template = ",".join(
                        cur.mogrify("(%s,%s,%s,%s,%s,%s::jsonb)", a).decode() for a in args
                    )
                    cur.execute(f"""
                        INSERT INTO detection_image_tasks
                            (task_id, image_filename, storage_path, image_width, image_height, original_annotations)
                        VALUES {values_template}
                    """)

                conn.commit()
                print(f"  Inserted {len(records)} image tasks")
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        print()
        print("Done!")
        print(f"  Task ID     : {task_id}")
        print(f"  Bucket      : {bucket_name}")
        print(f"  Images      : {len(records)}")
