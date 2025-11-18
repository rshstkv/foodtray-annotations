#!/usr/bin/env python3
"""
Unified CLI for professional data ingestion system.
Single entry point for all data loading operations.
"""
import sys
import argparse
import json
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.config import IngestConfig
from ingest.logger import StructuredLogger, LogLevel, get_logger, set_logger
from ingest.metrics import MetricsCollector
from ingest.storage import StorageManager
from ingest.database import DatabaseManager
from ingest.transaction import TransactionContext, QwenTransactionContext
from ingest.processor import ParallelDataProcessor


def generate_batch_id() -> str:
    """Generate timestamped batch ID."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"batch_{timestamp}"


def load_command(args):
    """Load recognitions from dataset."""
    logger = get_logger()
    logger.section("RECOGNITION DATA LOAD")
    
    # Initialize configuration
    config = IngestConfig.from_env(use_production=args.production)
    logger.info(
        "Environment loaded",
        environment=config.environment,
        threads=config.thread_count
    )
    
    # Initialize metrics
    metrics = MetricsCollector()
    
    # Initialize managers
    logger.info("Initializing connections")
    storage = StorageManager(config, metrics)
    database = DatabaseManager(config, metrics)
    
    # Test connections
    if not storage.test_connection():
        logger.error("Storage connection failed")
        return 1
    
    if not database.test_connection():
        logger.error("Database connection failed")
        return 1
    
    try:
        # Determine batch ID
        batch_id = args.batch_id or generate_batch_id()
        logger.info(f"Batch ID", value=batch_id)
        
        # Get existing recognition IDs (for incremental load)
        existing_ids = set()
        if not args.force:
            logger.info("Checking for existing recognitions")
            existing_ids = database.get_existing_recognition_ids()
            logger.info(f"Found existing recognitions", count=len(existing_ids))
        
        # Process dataset in parallel
        processor = ParallelDataProcessor(config, metrics)
        
        dataset_path = Path(args.source) if args.source else None
        recognitions = processor.process_dataset(
            dataset_path=dataset_path,
            batch_id=batch_id,
            limit=args.limit,
            existing_ids=existing_ids,
            force_reupload=args.force
        )
        
        if not recognitions:
            logger.info("No recognitions to load")
            return 0
        
        # Load in batches using transaction context
        logger.info(f"Loading recognitions to database and storage")
        
        batch_size = config.batch_size
        total_loaded = 0
        
        for i in range(0, len(recognitions), batch_size):
            batch = recognitions[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(recognitions) + batch_size - 1) // batch_size
            
            logger.info(
                f"Processing batch {batch_num}/{total_batches}",
                size=len(batch)
            )
            
            with TransactionContext(storage, database) as tx:
                tx.stage_recognitions(batch, use_temp_storage=False)
                # Transaction auto-commits on exit
            
            total_loaded += len(batch)
        
        # Print performance metrics
        print(metrics.format_summary())
        
        logger.success(
            "Load completed successfully",
            loaded=total_loaded,
            batch_id=batch_id
        )
        
        # Load Qwen annotations if requested
        if args.with_qwen:
            logger.info("Loading Qwen annotations...")
            qwen_args = argparse.Namespace(
                production=args.production,
                file=None  # Use default search paths
            )
            qwen_result = load_qwen_command(qwen_args)
            if qwen_result != 0:
                logger.warning("Qwen annotations load failed, but main load succeeded")
        
        return 0
        
    except KeyboardInterrupt:
        logger.warning("Operation cancelled by user")
        return 130
    except Exception as e:
        logger.error("Load failed", error=str(e))
        return 1
    finally:
        database.close()


def load_qwen_command(args):
    """Load Qwen annotations."""
    logger = get_logger()
    logger.section("QWEN ANNOTATIONS LOAD")
    
    # Initialize configuration
    config = IngestConfig.from_env(use_production=args.production)
    logger.info("Environment loaded", environment=config.environment)
    
    # Initialize components
    metrics = MetricsCollector()
    database = DatabaseManager(config, metrics)
    
    if not database.test_connection():
        logger.error("Database connection failed")
        return 1
    
    try:
        # Find Qwen annotations file
        qwen_path = Path(args.file) if args.file else None
        if not qwen_path or not qwen_path.exists():
            # Try default locations
            possible_paths = [
                Path.cwd() / "qwen_annotations.json",
                Path.home() / "Downloads" / "qwen_annotations.json",
                Path.home() / "qwen_annotations.json",
            ]
            
            for path in possible_paths:
                if path.exists():
                    qwen_path = path
                    break
            
            if not qwen_path or not qwen_path.exists():
                logger.error("Qwen annotations file not found")
                return 1
        
        logger.info(f"Loading Qwen annotations", file=str(qwen_path))
        
        # Load JSON
        with open(qwen_path, 'r', encoding='utf-8') as f:
            qwen_data = json.load(f)
        
        logger.info(f"Loaded annotations", images=len(qwen_data))
        
        # Get existing recognition IDs
        existing_ids = database.get_existing_recognition_ids()
        logger.info(f"Found existing recognitions", count=len(existing_ids))
        
        if not existing_ids:
            logger.error("No recognitions in database. Load recognitions first.")
            return 1
        
        # Parse annotations
        annotations = []
        for image_path, data in qwen_data.items():
            # Extract recognition_id from path
            import re
            match = re.search(r'recognition_(\d+)', image_path)
            if not match:
                continue
            
            recognition_id = int(match.group(1))
            
            # Process dishes (FOOD)
            dishes = data.get('dishes', {})
            for detection in dishes.get('qwen_detections', []):
                bbox_2d = detection.get('bbox_2d', [])
                label = detection.get('label', '')
                
                if len(bbox_2d) == 4:
                    bbox_json = json.dumps({
                        'x': bbox_2d[0],
                        'y': bbox_2d[1],
                        'w': bbox_2d[2] - bbox_2d[0],
                        'h': bbox_2d[3] - bbox_2d[1]
                    })
                    
                    camera_path = 'camera1.jpg' if 'Main' in image_path else 'camera2.jpg'
                    
                    annotations.append((
                        recognition_id,
                        camera_path,
                        bbox_json,
                        label,
                        'FOOD',
                        None
                    ))
            
            # Process plates (PLATE)
            plates = data.get('plates', {})
            for detection in plates.get('qwen_detections', []):
                bbox_2d = detection.get('bbox_2d', [])
                label = detection.get('label', '')
                
                if len(bbox_2d) == 4:
                    bbox_json = json.dumps({
                        'x': bbox_2d[0],
                        'y': bbox_2d[1],
                        'w': bbox_2d[2] - bbox_2d[0],
                        'h': bbox_2d[3] - bbox_2d[1]
                    })
                    
                    camera_path = 'camera1.jpg' if 'Main' in image_path else 'camera2.jpg'
                    
                    annotations.append((
                        recognition_id,
                        camera_path,
                        bbox_json,
                        label,
                        'PLATE',
                        None
                    ))
        
        logger.info(f"Parsed annotations", total=len(annotations))
        
        # Load with transaction
        with QwenTransactionContext(database) as tx:
            tx.load_qwen_annotations(annotations, existing_ids)
        
        logger.success("Qwen annotations loaded successfully")
        
        return 0
        
    except KeyboardInterrupt:
        logger.warning("Operation cancelled by user")
        return 130
    except Exception as e:
        logger.error("Load failed", error=str(e))
        return 1
    finally:
        database.close()


def reset_command(args):
    """Reset/delete batch data."""
    logger = get_logger()
    logger.section("RESET BATCH DATA")
    
    # Initialize configuration
    config = IngestConfig.from_env(use_production=args.production)
    logger.info("Environment loaded", environment=config.environment)
    
    # Initialize managers
    storage = StorageManager(config)
    database = DatabaseManager(config)
    
    if not database.test_connection():
        logger.error("Database connection failed")
        return 1
    
    try:
        batch_id = args.batch_id
        logger.info(f"Preparing to delete batch", batch_id=batch_id)
        
        # Get recognition IDs for this batch
        recognition_ids = database.get_recognition_ids_by_batch(batch_id)
        
        if not recognition_ids:
            logger.warning(f"No data found for batch", batch_id=batch_id)
            return 0
        
        # Estimate storage size (approximate)
        estimated_storage_mb = len(recognition_ids) * 2 * 1.5  # 2 images * ~1.5MB each
        
        # Show what will be deleted
        logger.info("Data to be deleted:")
        logger.info(f"  - Recognitions: {len(recognition_ids)}")
        logger.info(f"  - Images: {len(recognition_ids) * 2}")
        logger.info(f"  - Estimated storage: ~{estimated_storage_mb:.0f} MB")
        
        # Confirm deletion (unless --confirm flag provided)
        if not args.confirm:
            response = input("\nConfirm deletion? [y/N]: ")
            if response.lower() != 'y':
                logger.info("Deletion cancelled")
                return 0
        
        # Delete database data
        logger.info("Deleting database records")
        counts = database.delete_batch_data(batch_id)
        
        for key, value in counts.items():
            logger.info(f"  Deleted {key}", count=value)
        
        # Delete storage files
        logger.info("Deleting storage files")
        deleted = 0
        for recognition_id in recognition_ids:
            if storage.delete_recognition_files(recognition_id):
                deleted += 1
        
        logger.success(
            "Batch deleted successfully",
            recognitions=len(recognition_ids),
            storage_files_deleted=deleted
        )
        
        return 0
        
    except KeyboardInterrupt:
        logger.warning("Operation cancelled by user")
        return 130
    except Exception as e:
        logger.error("Reset failed", error=str(e))
        return 1
    finally:
        database.close()


def status_command(args):
    """Check system status."""
    logger = get_logger()
    logger.section("SYSTEM STATUS")
    
    # Initialize configuration
    config = IngestConfig.from_env(use_production=args.production)
    logger.info("Environment", type=config.environment)
    
    # Initialize managers
    storage = StorageManager(config)
    database = DatabaseManager(config)
    
    # Test connections
    storage_ok = storage.test_connection()
    database_ok = database.test_connection()
    
    if not database_ok:
        return 1
    
    # Get counts
    try:
        with database.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if tables exist
                def table_exists(table_name):
                    cur.execute("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_schema = %s AND table_name = %s
                        )
                    """, (table_name.split('.')[0] if '.' in table_name else 'public', 
                          table_name.split('.')[1] if '.' in table_name else table_name))
                    return cur.fetchone()[0]
                
                # Raw layer
                raw_recs = 0
                raw_recipes = 0
                raw_qwen = 0
                
                if table_exists('raw.recognition_files'):
                    cur.execute("SELECT COUNT(*) FROM raw.recognition_files")
                    raw_recs = cur.fetchone()[0]
                
                if table_exists('raw.recipes'):
                    cur.execute("SELECT COUNT(*) FROM raw.recipes")
                    raw_recipes = cur.fetchone()[0]
                
                if table_exists('raw.qwen_annotations'):
                    cur.execute("SELECT COUNT(*) FROM raw.qwen_annotations")
                    raw_qwen = cur.fetchone()[0]
                
                # Domain layer
                recognitions = 0
                images = 0
                recipes = 0
                
                if table_exists('recognitions'):
                    cur.execute("SELECT COUNT(*) FROM recognitions")
                    recognitions = cur.fetchone()[0]
                
                if table_exists('images'):
                    cur.execute("SELECT COUNT(*) FROM images")
                    images = cur.fetchone()[0]
                
                if table_exists('recipes'):
                    cur.execute("SELECT COUNT(*) FROM recipes")
                    recipes = cur.fetchone()[0]
        
        logger.info("Database Status:")
        logger.info(f"  Raw layer:")
        logger.info(f"    - recognition_files: {raw_recs:,}")
        logger.info(f"    - recipes: {raw_recipes:,}")
        logger.info(f"    - qwen_annotations: {raw_qwen:,}")
        logger.info(f"  Domain layer:")
        logger.info(f"    - recognitions: {recognitions:,}")
        logger.info(f"    - images: {images:,}")
        logger.info(f"    - recipes: {recipes:,}")
        
        if storage_ok:
            logger.success("All systems operational")
        else:
            logger.warning("Storage connection issues detected")
        
        return 0
        
    except Exception as e:
        logger.error("Status check failed", error=str(e))
        return 1
    finally:
        database.close()


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Professional Data Ingestion System",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # Global options
    parser.add_argument(
        '--production',
        action='store_true',
        help='Use production environment'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    # Subcommands
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Load recognitions
    load_parser = subparsers.add_parser('load', help='Load recognitions from dataset')
    load_parser.add_argument(
        '--source',
        type=str,
        help='Dataset directory path'
    )
    load_parser.add_argument(
        '--limit',
        type=int,
        help='Limit number of recognitions to load'
    )
    load_parser.add_argument(
        '--batch-id',
        type=str,
        help='Custom batch ID (auto-generated if not provided)'
    )
    load_parser.add_argument(
        '--force',
        action='store_true',
        help='Force reload of existing recognitions'
    )
    load_parser.add_argument(
        '--with-qwen',
        action='store_true',
        help='Also load Qwen annotations after recognition data'
    )
    
    # Load Qwen annotations
    qwen_parser = subparsers.add_parser('load-qwen', help='Load Qwen annotations')
    qwen_parser.add_argument(
        '--file',
        type=str,
        help='Path to qwen_annotations.json'
    )
    
    # Reset batch
    reset_parser = subparsers.add_parser('reset', help='Delete batch data')
    reset_parser.add_argument(
        '--batch-id',
        type=str,
        required=True,
        help='Batch ID to delete'
    )
    reset_parser.add_argument(
        '--confirm',
        action='store_true',
        help='Skip confirmation prompt'
    )
    
    # Status check
    status_parser = subparsers.add_parser('status', help='Check system status')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Setup logger
    log_level = LogLevel.DEBUG if args.verbose else LogLevel.INFO
    set_logger(StructuredLogger(min_level=log_level))
    
    # Execute command
    if args.command == 'load':
        return load_command(args)
    elif args.command == 'load-qwen':
        return load_qwen_command(args)
    elif args.command == 'reset':
        return reset_command(args)
    elif args.command == 'status':
        return status_command(args)
    else:
        parser.print_help()
        return 1


if __name__ == '__main__':
    sys.exit(main())

