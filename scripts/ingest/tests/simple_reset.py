#!/usr/bin/env python3
"""Simple production database reset."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ingest.config import IngestConfig
from ingest.database import DatabaseManager
from ingest.logger import get_logger

logger = get_logger()

config = IngestConfig.from_env(use_production=True)
db = DatabaseManager(config)

logger.info("Resetting production database...")

try:
    # Use autocommit to handle errors per table
    conn = db.pool.getconn()
    conn.autocommit = True
    
    try:
        with conn.cursor() as cur:
            # Execute deletes in order
            tables = [
                "work_annotations",
                "work_items", 
                "validation_session_items",
                "initial_annotations",
                "initial_tray_items",
                "recipe_line_options",
                "recipe_lines",
                "recipes",
                "recognition_active_menu_items",
                "images",
                "recognitions",
                "raw.qwen_annotations",
                "raw.recipes",
                "raw.recognition_files"
            ]
            
            for table in tables:
                try:
                    cur.execute(f"DELETE FROM {table}")
                    count = cur.rowcount
                    if count > 0:
                        logger.info(f"  Deleted from {table}", count=count)
                except Exception as e:
                    if "does not exist" not in str(e):
                        logger.warning(f"  Error deleting {table}", error=str(e))
            
        logger.info("✅ Production database reset complete")
    finally:
        db.pool.putconn(conn)
            
except Exception as e:
    logger.error("Reset failed", error=str(e))
    sys.exit(1)
finally:
    db.close()

