#!/usr/bin/env python3
"""
Populate product_catalog from unique (name, ean, product_type, item_type) in test_split_items.

Usage:
  .venv/bin/python3 scripts/populate_catalog.py
  .venv/bin/python3 scripts/populate_catalog.py --env staging
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


DUMMY_KEYWORDS = ["DUMMY"]


def main():
    parser = argparse.ArgumentParser(description="Populate product_catalog from test_split_items")
    parser.add_argument("--env", default="local", choices=["local", "staging"],
                        help="Target environment (default: local)")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    env_map = {"local": ".env.local", "staging": ".env.staging"}
    load_dotenv(project_root / env_map[args.env])

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    print("=" * 60)
    print("Populate Product Catalog")
    print("=" * 60)

    cur.execute("""
        SELECT DISTINCT name, ean, product_type, item_type
        FROM test_split_items
        ORDER BY product_type, name
    """)
    rows = cur.fetchall()
    print(f"Unique products in test_split_items: {len(rows)}")

    cur.execute("SELECT COUNT(*) FROM product_catalog")
    existing = cur.fetchone()[0]
    print(f"Existing catalog entries: {existing}")

    inserted = 0
    skipped = 0

    for name, ean, product_type, item_type in rows:
        is_dummy = any(kw in (name or "").upper() for kw in DUMMY_KEYWORDS)

        cur.execute(
            """INSERT INTO product_catalog (name, ean, product_type, item_type, is_dummy)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (name, COALESCE(ean, '')) DO NOTHING""",
            (name, ean, product_type, item_type, is_dummy)
        )
        if cur.rowcount > 0:
            inserted += 1
        else:
            skipped += 1

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM product_catalog")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM product_catalog WHERE is_dummy = TRUE")
    dummy_count = cur.fetchone()[0]

    conn.close()

    print()
    print(f"Inserted: {inserted}")
    print(f"Skipped (already exists): {skipped}")
    print(f"Total catalog entries: {total}")
    print(f"  of which dummy: {dummy_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
