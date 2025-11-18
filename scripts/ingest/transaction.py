"""
Two-phase transaction coordinator for Storage + Database operations.
Ensures atomic commits across both systems with rollback support.
"""
from typing import List, Tuple, Optional
from dataclasses import dataclass
import json

from .storage import StorageManager
from .database import DatabaseManager
from .logger import get_logger
from .config import STATUS_PENDING, STATUS_PROCESSING, STATUS_COMPLETE, STATUS_FAILED, STATUS_ROLLED_BACK


@dataclass
class RecognitionData:
    """Data for a single recognition."""
    recognition_id: int
    batch_id: str
    active_menu: Optional[str]
    image1_path: str
    image2_path: str
    image1_width: int
    image1_height: int
    image2_width: int
    image2_height: int
    image1_data: bytes
    image2_data: bytes
    recipe_payload: Optional[dict] = None


class TransactionContext:
    """
    Manages two-phase transactions between Storage and Database.
    
    Phase 1 (Prepare):
        - Upload images to temporary Storage location
        - Insert data to database (not committed)
    
    Phase 2 (Commit):
        - Commit database transaction
        - Move images from temp to permanent location (or use upsert)
    
    On failure:
        - Rollback database transaction
        - Delete temporary Storage files
    """
    
    def __init__(self, storage: StorageManager, database: DatabaseManager):
        self.storage = storage
        self.database = database
        self.logger = get_logger()
        
        self._status = STATUS_PENDING
        self._db_conn = None
        self._staged_recognitions: List[RecognitionData] = []
    
    def __enter__(self):
        """Enter transaction context."""
        self._status = STATUS_PROCESSING
        # Get database connection for the entire transaction
        self._db_conn = self.database.pool.getconn()
        self._db_conn.autocommit = False
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit transaction context with automatic rollback on error."""
        try:
            if exc_type is not None:
                # Exception occurred, rollback
                self.rollback()
                self._status = STATUS_ROLLED_BACK
                return False  # Re-raise exception
            else:
                # No exception, can commit
                if self._status == STATUS_PROCESSING:
                    self.commit()
                    self._status = STATUS_COMPLETE
        finally:
            # Always return connection to pool
            if self._db_conn:
                self.database.pool.putconn(self._db_conn)
                self._db_conn = None
        
        return False
    
    def stage_recognitions(
        self,
        recognitions: List[RecognitionData],
        use_temp_storage: bool = False
    ):
        """
        Stage recognition data (Phase 1: Prepare).
        
        Args:
            recognitions: List of recognition data to stage
            use_temp_storage: If True, upload to temp location (safer but slower)
        """
        self.logger.info("Staging recognitions", count=len(recognitions))
        
        # Stage 1: Upload images to storage
        self._stage_images(recognitions, use_temp_storage)
        
        # Stage 2: Insert data to database (not committed yet)
        self._stage_database(recognitions)
        
        # Remember staged data for potential rollback
        self._staged_recognitions.extend(recognitions)
    
    def _stage_images(self, recognitions: List[RecognitionData], use_temp: bool):
        """Upload images to storage."""
        self.logger.info("Uploading images to storage", count=len(recognitions) * 2)
        
        # Prepare all uploads
        uploads = []
        for rec in recognitions:
            # Camera 1
            path1 = f"recognitions/{rec.recognition_id}/{rec.image1_path}"
            uploads.append((path1, rec.image1_data))
            
            # Camera 2
            path2 = f"recognitions/{rec.recognition_id}/{rec.image2_path}"
            uploads.append((path2, rec.image2_data))
        
        # Batch upload with parallelism
        successful, failed = self.storage.batch_upload(uploads, use_temp=use_temp)
        
        if failed > 0:
            raise Exception(f"Failed to upload {failed} images")
        
        self.logger.success("Images uploaded", count=successful)
    
    def _stage_database(self, recognitions: List[RecognitionData]):
        """Insert data to database (in transaction, not committed)."""
        self.logger.info("Inserting data to database")
        
        # Prepare recognition rows
        recognition_rows = []
        for rec in recognitions:
            recognition_rows.append((
                rec.recognition_id,
                rec.batch_id,
                rec.active_menu,
                rec.image1_path,
                rec.image2_path,
                rec.image1_width,
                rec.image1_height,
                rec.image2_width,
                rec.image2_height,
            ))
        
        # Bulk insert recognitions
        if recognition_rows:
            self.database.bulk_copy(
                "raw.recognition_files",
                [
                    "recognition_id", "batch_id", "active_menu",
                    "image1_path", "image2_path",
                    "image1_width", "image1_height",
                    "image2_width", "image2_height"
                ],
                recognition_rows,
                conn=self._db_conn
            )
        
        # Prepare recipe rows
        recipe_rows = []
        for rec in recognitions:
            if rec.recipe_payload:
                recipe_rows.append((
                    rec.recognition_id,
                    json.dumps(rec.recipe_payload)
                ))
        
        # Bulk insert recipes
        if recipe_rows:
            self.database.bulk_copy(
                "raw.recipes",
                ["recognition_id", "payload"],
                recipe_rows,
                conn=self._db_conn
            )
        
        self.logger.success(
            "Database staging complete",
            recognitions=len(recognition_rows),
            recipes=len(recipe_rows)
        )
    
    def commit(self):
        """
        Commit transaction (Phase 2: Commit).
        Makes all changes permanent.
        """
        self.logger.info("Committing transaction")
        
        try:
            # Commit database transaction
            if self._db_conn:
                self._db_conn.commit()
                self.logger.success("Database transaction committed")
            
            # Move temp files to permanent location (if using temp storage)
            if self.storage._temp_files:
                self.storage.commit_temp_files()
                self.logger.success("Storage files committed")
            
            # Run transform functions to populate domain tables
            self._run_transforms()
            
            self.logger.success("Transaction committed successfully")
            
        except Exception as e:
            self.logger.error("Commit failed, rolling back", error=str(e))
            self.rollback()
            raise
    
    def _run_transforms(self):
        """Run database transform functions."""
        self.logger.info("Running transform functions")
        
        # Transform recognitions and images
        rec_count, img_count, menu_count = self.database.transform_recognitions_and_images(
            conn=self._db_conn
        )
        
        # Transform recipes
        recipe_count, line_count, opt_count = self.database.transform_recipes(
            conn=self._db_conn
        )
        
        # Commit transforms
        if self._db_conn:
            self._db_conn.commit()
        
        self.logger.success(
            "Transforms complete",
            recognitions=rec_count,
            images=img_count,
            recipes=recipe_count
        )
    
    def rollback(self):
        """
        Rollback transaction.
        Removes all staged data from both Storage and Database.
        """
        self.logger.warning("Rolling back transaction")
        
        # Rollback database
        if self._db_conn:
            try:
                self._db_conn.rollback()
                self.logger.info("Database rolled back")
            except Exception as e:
                self.logger.error("Database rollback failed", error=str(e))
        
        # Delete temporary storage files
        if self.storage._temp_files:
            try:
                self.storage.rollback_temp_files()
                self.logger.info("Temporary storage files deleted")
            except Exception as e:
                self.logger.error("Storage rollback failed", error=str(e))
        
        # If not using temp storage, need to delete permanent files
        # (This is why temp storage is safer!)
        if not self.storage._temp_files and self._staged_recognitions:
            self.logger.warning("Rolling back permanent storage files")
            for rec in self._staged_recognitions:
                self.storage.delete_recognition_files(rec.recognition_id)
        
        self.logger.warning("Transaction rolled back")


class QwenTransactionContext:
    """
    Simpler transaction context for Qwen annotations.
    Only needs database transaction (no storage operations).
    """
    
    def __init__(self, database: DatabaseManager):
        self.database = database
        self.logger = get_logger()
        self._db_conn = None
    
    def __enter__(self):
        """Enter transaction context."""
        self._db_conn = self.database.pool.getconn()
        self._db_conn.autocommit = False
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit transaction context."""
        try:
            if exc_type is not None:
                if self._db_conn:
                    self._db_conn.rollback()
                return False
            else:
                if self._db_conn:
                    self._db_conn.commit()
        finally:
            if self._db_conn:
                self.database.pool.putconn(self._db_conn)
                self._db_conn = None
        
        return False
    
    def load_qwen_annotations(
        self,
        annotations: List[Tuple],
        existing_recognition_ids: set
    ):
        """
        Load Qwen annotations for existing recognitions.
        
        Args:
            annotations: List of annotation tuples
            existing_recognition_ids: Set of valid recognition IDs
        """
        # Filter annotations by existing recognitions
        filtered = [
            ann for ann in annotations
            if ann[0] in existing_recognition_ids
        ]
        
        skipped = len(annotations) - len(filtered)
        if skipped > 0:
            self.logger.info(f"Filtered annotations", kept=len(filtered), skipped=skipped)
        
        # Bulk insert
        if filtered:
            self.database.bulk_copy(
                "raw.qwen_annotations",
                ["recognition_id", "image_path", "bbox", "class_name", "item_type", "external_id"],
                filtered,
                conn=self._db_conn
            )
        
        # Transform to domain model
        item_count, ann_count = self.database.transform_initial_items_and_annotations(
            conn=self._db_conn
        )
        
        self.logger.success(
            "Qwen annotations loaded",
            annotations=len(filtered),
            items=item_count,
            ann_count=ann_count
        )

