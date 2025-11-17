#!/usr/bin/env python3
"""
Manually run all transform functions for a given batch_id
"""
import sys
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.shared import (
    load_env, get_db_connection, log, call_transform_function, validate_env
)


def main():
    parser = argparse.ArgumentParser(description='Run transform functions')
    parser.add_argument('--batch-id', type=str, required=True, 
                       help='Batch ID to transform')
    
    args = parser.parse_args()
    
    # Setup
    load_env()
    validate_env()
    
    log("=" * 60, "INFO")
    log("MANUAL TRANSFORM", "INFO")
    log("=" * 60, "INFO")
    log(f"Batch ID: {args.batch_id}", "INFO")
    
    # Connect to database
    log("Connecting to database...", "INFO")
    conn = get_db_connection()
    
    # Run all transform functions
    transforms = [
        ('transform_menu_items', 'Menu Items'),
        ('transform_recognitions', 'Recognitions & Images'),
        ('transform_checks', 'Checks & Check Lines'),
        ('transform_initial_annotations', 'Initial Annotations')
    ]
    
    results = {}
    
    for func_name, description in transforms:
        log(f"Running {description}...", "INFO")
        try:
            count = call_transform_function(conn, func_name, args.batch_id)
            results[description] = count
            log(f"  Processed {count} records", "SUCCESS")
        except Exception as e:
            log(f"  Failed: {e}", "ERROR")
            results[description] = f"ERROR: {e}"
    
    conn.close()
    
    log("=" * 60, "INFO")
    log("TRANSFORM COMPLETE!", "SUCCESS")
    log("=" * 60, "INFO")
    log("📊 Summary:", "INFO")
    for description, result in results.items():
        if isinstance(result, int):
            log(f"  - {description}: {result} records", "INFO")
        else:
            log(f"  - {description}: {result}", "ERROR")


if __name__ == "__main__":
    main()




