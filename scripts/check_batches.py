#!/usr/bin/env python3
"""Check batch IDs in production database"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ingest'))

from database import DatabaseManager
from config import Config

def main():
    config = Config(use_production=True)
    db = DatabaseManager(config)
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check batches in raw layer
                print("\n📦 Batch IDs in raw.recognition_files:")
                cur.execute("""
                    SELECT batch_id, COUNT(*) as count
                    FROM raw.recognition_files
                    GROUP BY batch_id
                    ORDER BY batch_id
                """)
                for row in cur.fetchall():
                    print(f"  - {row[0]}: {row[1]} files")
                
                # Check total counts
                print("\n📊 Total counts:")
                cur.execute("SELECT COUNT(*) FROM raw.recognition_files")
                print(f"  - recognition_files: {cur.fetchone()[0]}")
                
                cur.execute("SELECT COUNT(*) FROM raw.recipes")
                print(f"  - recipes: {cur.fetchone()[0]}")
                
                cur.execute("SELECT COUNT(*) FROM recognitions")
                print(f"  - recognitions: {cur.fetchone()[0]}")
                
    finally:
        db.close()

if __name__ == '__main__':
    main()

