#!/usr/bin/env python3
"""
Import test split data from parquet into test_split_* tables.

Reads parquet, filters split=='test', and populates:
  - test_split_recognitions
  - test_split_items  (unique objects per recognition)
  - test_split_annotations (bboxes per camera per item)

Prerequisites:
  - recognitions + images must already exist in DB (run pull_from_prod.py first)
  - Migration 20260217000000_test_split_tables.sql must be applied

Usage:
  .venv/bin/python3 scripts/import_test_split.py --parquet ~/Downloads/pingodoce_21k_with_bboxes_ups_fixed.parquet --limit 100
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
import pyarrow.parquet as pq
from dotenv import load_dotenv
from tqdm import tqdm

PRODUCT_TYPE_TO_ITEM_TYPE = {
    "PLATE": "PLATE",
    "BUZZER_WHITE": "BUZZER",
    "Sobremesa": "FOOD",
    "Adicionais": "FOOD",
    "Bebida": "FOOD",
    "Prato": "FOOD",
    "Acompanhamento": "FOOD",
}


def convert_numpy(obj):
    """Recursively convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, np.ndarray):
        return [convert_numpy(x) for x in obj.tolist()]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_numpy(x) for x in obj]
    return obj


def parse_bboxes(bboxes_raw):
    """Parse numpy array of bbox dicts from parquet into clean Python dicts."""
    if bboxes_raw is None:
        return []
    result = []
    for bb in bboxes_raw:
        bbox_xywh = bb.get("bbox_xywh")
        if bbox_xywh is None:
            continue
        if isinstance(bbox_xywh, np.ndarray):
            bbox_xywh = bbox_xywh.tolist()
        up_val = bb.get("up")
        if isinstance(up_val, (np.bool_,)):
            up_val = bool(up_val)
        elif up_val is None or (isinstance(up_val, float) and np.isnan(up_val)):
            up_val = None

        result.append({
            "name": str(bb.get("name", "")),
            "ean": str(bb.get("ean", "")),
            "product_type": str(bb.get("product_type", "")),
            "up": up_val,
            "bbox": {
                "x": round(float(bbox_xywh[0]), 2),
                "y": round(float(bbox_xywh[1]), 2),
                "w": round(float(bbox_xywh[2]), 2),
                "h": round(float(bbox_xywh[3]), 2),
            },
        })
    return result


def main():
    parser = argparse.ArgumentParser(description="Import test split from parquet into DB")
    parser.add_argument("--parquet", required=True, help="Path to parquet file")
    parser.add_argument("--env", default="local", choices=["local", "staging"],
                        help="Target environment (default: local)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of recognitions")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    env_map = {"local": ".env.local", "staging": ".env.staging"}
    load_dotenv(project_root / env_map[args.env])

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not set")
        sys.exit(1)

    print("=" * 60)
    print("Import Test Split from Parquet")
    print("=" * 60)
    print(f"Environment: {args.env}")

    # Read parquet
    print("Reading parquet...")
    df = pq.read_table(args.parquet).to_pandas()
    test_df = df[df["split"] == "test"].copy().sort_values("recognition_id")
    print(f"Total test split recognitions in parquet: {len(test_df)}")

    if args.limit:
        test_df = test_df.head(args.limit)
        print(f"Limited to: {len(test_df)}")

    # Connect
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Check which recognitions exist in DB (prerequisite)
    rec_ids = test_df["recognition_id"].tolist()
    cur.execute("SELECT id FROM recognitions WHERE id = ANY(%s)", (rec_ids,))
    existing_rec_ids = set(r[0] for r in cur.fetchall())
    print(f"Recognitions present in DB: {len(existing_rec_ids)} / {len(rec_ids)}")

    # Check which are already imported
    cur.execute("SELECT recognition_id FROM test_split_recognitions WHERE recognition_id = ANY(%s)", (rec_ids,))
    already_imported = set(r[0] for r in cur.fetchall())
    print(f"Already imported: {len(already_imported)}")

    # Build image_id lookup: (recognition_id, camera_number) -> image_id
    cur.execute(
        "SELECT id, recognition_id, camera_number FROM images WHERE recognition_id = ANY(%s)",
        (rec_ids,)
    )
    image_lookup = {}
    for img_id, rec_id, cam_num in cur.fetchall():
        image_lookup[(rec_id, cam_num)] = img_id

    imported = 0
    skipped = 0
    missing_rec = 0
    missing_images = 0

    for _, row in tqdm(test_df.iterrows(), total=len(test_df), desc="Importing"):
        rec_id = int(row["recognition_id"])

        if rec_id in already_imported:
            skipped += 1
            continue

        if rec_id not in existing_rec_ids:
            missing_rec += 1
            continue

        # Check images exist
        img_id_cam1 = image_lookup.get((rec_id, 1))
        img_id_cam2 = image_lookup.get((rec_id, 2))
        if not img_id_cam1 and not img_id_cam2:
            missing_images += 1
            continue

        # Parse active_menu and correct_dishes
        active_menu = convert_numpy(row.get("active_menu"))
        correct_dishes = convert_numpy(row.get("correct_dishes"))
        captured_at = row.get("timestamp")
        if hasattr(captured_at, "isoformat"):
            captured_at = captured_at.isoformat()
        else:
            captured_at = str(captured_at) if captured_at else None

        # Insert test_split_recognitions
        cur.execute(
            """INSERT INTO test_split_recognitions
               (recognition_id, canteen_guid, canteen_name, captured_at, active_menu, correct_dishes, split)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (recognition_id) DO NOTHING""",
            (rec_id, str(row.get("canteen_guid", "")), str(row.get("canteen_name", "")),
             captured_at,
             json.dumps(active_menu, ensure_ascii=False, default=str) if active_menu is not None else None,
             json.dumps(correct_dishes, ensure_ascii=False, default=str) if correct_dishes is not None else None,
             "test")
        )

        # Parse bboxes from both cameras
        bboxes_cam1 = parse_bboxes(row.get("image_45_bboxes"))
        bboxes_cam2 = parse_bboxes(row.get("image_90_bboxes"))

        # Group by (name, ean) -> item, collecting annotations per camera
        items_map = {}  # (name, ean) -> {item_data, annotations: [(camera, bbox)]}
        for bb in bboxes_cam1:
            key = (bb["name"], bb["ean"])
            if key not in items_map:
                pt = bb["product_type"]
                items_map[key] = {
                    "name": bb["name"],
                    "ean": bb["ean"],
                    "product_type": pt,
                    "item_type": PRODUCT_TYPE_TO_ITEM_TYPE.get(pt, "FOOD"),
                    "up": bb["up"],
                    "annotations": [],
                }
            items_map[key]["annotations"].append((1, bb["bbox"]))
            if bb["up"] is not None:
                items_map[key]["up"] = bb["up"]

        for bb in bboxes_cam2:
            key = (bb["name"], bb["ean"])
            if key not in items_map:
                pt = bb["product_type"]
                items_map[key] = {
                    "name": bb["name"],
                    "ean": bb["ean"],
                    "product_type": pt,
                    "item_type": PRODUCT_TYPE_TO_ITEM_TYPE.get(pt, "FOOD"),
                    "up": bb["up"],
                    "annotations": [],
                }
            items_map[key]["annotations"].append((2, bb["bbox"]))
            if bb["up"] is not None:
                items_map[key]["up"] = bb["up"]

        # Insert items and annotations
        for (name, ean), item_data in items_map.items():
            cur.execute(
                """INSERT INTO test_split_items
                   (recognition_id, name, ean, product_type, item_type, up)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (rec_id, item_data["name"], item_data["ean"],
                 item_data["product_type"], item_data["item_type"], item_data["up"])
            )
            item_id = cur.fetchone()[0]

            for cam_num, bbox in item_data["annotations"]:
                img_id = image_lookup.get((rec_id, cam_num))
                cur.execute(
                    """INSERT INTO test_split_annotations
                       (recognition_id, test_split_item_id, image_id, camera_number, bbox)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (rec_id, item_id, img_id, cam_num, json.dumps(bbox))
                )

        conn.commit()
        imported += 1

    conn.close()

    print()
    print("=" * 60)
    print(f"Import complete!")
    print(f"  Imported: {imported}")
    print(f"  Skipped (already imported): {skipped}")
    print(f"  Missing in recognitions table: {missing_rec}")
    print(f"  Missing images: {missing_images}")
    print("=" * 60)


if __name__ == "__main__":
    main()
