#!/usr/bin/env python3
"""
Safely pull recognitions + images from a remote environment (staging/production)
into the local environment for test split validation.

READ-ONLY on source: only SELECT queries and storage downloads.
WRITE on target: inserts into recognitions, images + uploads to storage.

Usage:
  .venv/bin/python3 scripts/pull_from_prod.py --parquet ~/Downloads/pingodoce_21k_with_bboxes_ups_fixed.parquet --source-env staging --limit 100
"""

import argparse
import os
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
import pyarrow.parquet as pq
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm


def load_env(env_name: str) -> dict:
    """Load environment variables from .env.{env_name} file."""
    project_root = Path(__file__).parent.parent
    env_map = {
        "local": ".env.local",
        "staging": ".env.staging",
        "production": ".env.production",
    }
    env_file = project_root / env_map[env_name]
    if not env_file.exists():
        print(f"Error: {env_file} not found")
        sys.exit(1)

    env_vars = {}
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env_vars[key.strip()] = value.strip()
    return env_vars


def main():
    parser = argparse.ArgumentParser(description="Pull recognitions from remote env to local")
    parser.add_argument("--parquet", required=True, help="Path to parquet file")
    parser.add_argument("--source-env", required=True, choices=["staging", "production"],
                        help="Source environment to pull from")
    parser.add_argument("--target-env", default="local", choices=["local", "staging"],
                        help="Target environment to push to (default: local)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of recognitions")
    parser.add_argument("--threads", type=int, default=4, help="Number of threads for image downloads")
    args = parser.parse_args()

    print("=" * 60)
    print("Pull from Remote Environment")
    print("=" * 60)
    print(f"Source: {args.source_env}")
    print(f"Target: {args.target_env}")
    print()

    # Load parquet and get test split IDs
    print("Reading parquet file...")
    df = pq.read_table(args.parquet).to_pandas()
    test_ids = sorted(df[df["split"] == "test"]["recognition_id"].tolist())
    if args.limit:
        test_ids = test_ids[: args.limit]
    print(f"Test split recognition IDs: {len(test_ids)}")

    # Load env configs
    source_env = load_env(args.source_env)
    target_env = load_env(args.target_env)

    source_db_url = source_env.get("DATABASE_URL")
    target_db_url = target_env.get("DATABASE_URL")
    source_supabase_url = source_env.get("NEXT_PUBLIC_SUPABASE_URL")
    source_supabase_key = source_env.get("SUPABASE_SERVICE_ROLE_KEY")
    target_supabase_url = target_env.get("NEXT_PUBLIC_SUPABASE_URL")
    target_supabase_key = target_env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not all([source_db_url, target_db_url, source_supabase_url, source_supabase_key,
                target_supabase_url, target_supabase_key]):
        print("Error: Missing required environment variables in source or target env files")
        sys.exit(1)

    # Connect to source DB (READ-ONLY)
    print(f"\nConnecting to source DB ({args.source_env})...")
    source_conn = psycopg2.connect(source_db_url)
    source_conn.set_session(readonly=True)
    source_cur = source_conn.cursor()

    # Connect to target DB
    print(f"Connecting to target DB ({args.target_env})...")
    target_conn = psycopg2.connect(target_db_url)
    target_cur = target_conn.cursor()

    # Find which IDs exist in source
    source_cur.execute("SELECT id FROM recognitions WHERE id = ANY(%s)", (test_ids,))
    source_ids = set(r[0] for r in source_cur.fetchall())
    print(f"Found in source DB: {len(source_ids)} / {len(test_ids)}")

    if not source_ids:
        print("No recognitions found in source. Nothing to pull.")
        source_conn.close()
        target_conn.close()
        return

    # Find which IDs already exist in target
    target_cur.execute("SELECT id FROM recognitions WHERE id = ANY(%s)", (list(source_ids),))
    existing_ids = set(r[0] for r in target_cur.fetchall())
    new_ids = sorted(source_ids - existing_ids)
    print(f"Already in target: {len(existing_ids)}")
    print(f"New to pull: {len(new_ids)}")

    if not new_ids:
        print("All recognitions already exist in target. Nothing to pull.")
        source_conn.close()
        target_conn.close()
        return

    # Step 1: Copy recognition rows
    print(f"\n--- Step 1: Copying {len(new_ids)} recognition rows ---")
    source_cur.execute(
        "SELECT id, batch_id, created_at FROM recognitions WHERE id = ANY(%s)",
        (new_ids,)
    )
    rec_rows = source_cur.fetchall()
    for row in tqdm(rec_rows, desc="Inserting recognitions"):
        target_cur.execute(
            "INSERT INTO recognitions (id, batch_id, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            row
        )
    target_conn.commit()
    print(f"Inserted {len(rec_rows)} recognitions")

    # Step 2: Copy image rows
    print(f"\n--- Step 2: Copying image rows ---")
    source_cur.execute(
        "SELECT id, recognition_id, camera_number, storage_path, width, height, created_at "
        "FROM images WHERE recognition_id = ANY(%s) ORDER BY recognition_id, camera_number",
        (new_ids,)
    )
    img_rows = source_cur.fetchall()
    for row in tqdm(img_rows, desc="Inserting images"):
        target_cur.execute(
            "INSERT INTO images (id, recognition_id, camera_number, storage_path, width, height, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            row
        )
    target_conn.commit()
    print(f"Inserted {len(img_rows)} image rows")

    # Step 3: Download and upload photos
    print(f"\n--- Step 3: Transferring photos ({len(img_rows)} files) ---")
    source_sb = create_client(source_supabase_url, source_supabase_key)
    target_sb = create_client(target_supabase_url, target_supabase_key)

    storage_paths = [row[3] for row in img_rows]  # storage_path column

    def transfer_image(storage_path: str) -> tuple[str, bool, str]:
        """Download from source storage, upload to target storage."""
        try:
            data = source_sb.storage.from_("rrs-photos").download(storage_path)
            if not data:
                return storage_path, False, "Empty download"
            target_sb.storage.from_("rrs-photos").upload(
                storage_path, data,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )
            return storage_path, True, ""
        except Exception as e:
            error_msg = str(e)
            if "already exists" in error_msg.lower() or "duplicate" in error_msg.lower():
                return storage_path, True, "already exists"
            return storage_path, False, error_msg

    success = 0
    errors = 0
    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = {executor.submit(transfer_image, p): p for p in storage_paths}
        for future in tqdm(as_completed(futures), total=len(futures), desc="Transferring photos"):
            path, ok, msg = future.result()
            if ok:
                success += 1
            else:
                errors += 1
                if errors <= 5:
                    print(f"  Error: {path}: {msg}")

    print(f"Photos transferred: {success} ok, {errors} errors")

    # Cleanup
    source_conn.close()
    target_conn.close()

    print()
    print("=" * 60)
    print(f"Done! Pulled {len(new_ids)} recognitions + {success} photos")
    print(f"from {args.source_env} -> {args.target_env}")
    print("=" * 60)


if __name__ == "__main__":
    main()
