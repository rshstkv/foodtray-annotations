"""
Database manager with connection pooling and bulk operations.
Handles PostgreSQL operations with COPY for efficient bulk inserts.
"""
import io
import csv
from typing import List, Tuple, Optional, Any
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool, sql
from psycopg2.extensions import connection as Connection

from .config import IngestConfig
from .logger import get_logger
from .metrics import MetricsCollector


class DatabaseManager:
    """
    Manages database connections and operations with connection pooling.
    Provides efficient bulk inserts via PostgreSQL COPY.
    """
    
    def __init__(self, config: IngestConfig, metrics: Optional[MetricsCollector] = None):
        self.config = config
        self.metrics = metrics or MetricsCollector()
        self.logger = get_logger()
        
        # Create connection pool
        try:
            self.pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=config.connection_pool_size,
                dsn=config.database_url,
                connect_timeout=config.db_connect_timeout
            )
            self.logger.info("Database connection pool created", size=config.connection_pool_size)
        except Exception as e:
            self.logger.error("Failed to create connection pool", error=str(e))
            raise
    
    @contextmanager
    def get_connection(self) -> Connection:
        """
        Get connection from pool as context manager.
        Automatically returns connection to pool.
        """
        conn = None
        try:
            conn = self.pool.getconn()
            conn.autocommit = False  # Use explicit transactions
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self.pool.putconn(conn)
    
    def test_connection(self) -> bool:
        """Test database connection."""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT version()")
                    version = cur.fetchone()[0]
                    self.logger.info("Database connected", version=version[:50])
            return True
        except Exception as e:
            self.logger.error("Database connection failed", error=str(e))
            return False
    
    def bulk_copy(
        self,
        table_name: str,
        columns: List[str],
        rows: List[Tuple],
        conn: Optional[Connection] = None
    ) -> int:
        """
        Efficient bulk insert using PostgreSQL COPY.
        
        Args:
            table_name: Target table (can include schema: "schema.table")
            columns: List of column names
            rows: List of tuples with data
            conn: Optional connection (if None, gets from pool)
        
        Returns:
            Number of rows inserted
        """
        if not rows:
            return 0
        
        self.metrics.start_timer("db_bulk_copy")
        
        # Prepare CSV buffer
        csv_buffer = io.StringIO()
        csv_writer = csv.writer(csv_buffer)
        for row in rows:
            csv_writer.writerow(row)
        csv_buffer.seek(0)
        
        # Build COPY statement
        columns_str = ", ".join(columns)
        copy_sql = f"COPY {table_name} ({columns_str}) FROM STDIN WITH (FORMAT CSV)"
        
        # Execute COPY
        def _execute(connection):
            with connection.cursor() as cur:
                cur.copy_expert(copy_sql, csv_buffer)
            return len(rows)
        
        try:
            if conn:
                result = _execute(conn)
            else:
                with self.get_connection() as connection:
                    result = _execute(connection)
            
            self.metrics.stop_timer("db_bulk_copy")
            self.metrics.record_count("db_rows_inserted", result)
            
            self.logger.info(f"Bulk inserted into {table_name}", rows=result)
            return result
            
        except Exception as e:
            self.metrics.stop_timer("db_bulk_copy")
            self.logger.error(f"Bulk copy failed for {table_name}", error=str(e))
            raise
    
    def execute_query(
        self,
        query: str,
        params: Optional[Tuple] = None,
        conn: Optional[Connection] = None
    ) -> Optional[List[Tuple]]:
        """
        Execute a query and return results.
        
        Args:
            query: SQL query
            params: Query parameters
            conn: Optional connection
        
        Returns:
            Query results or None
        """
        def _execute(connection):
            with connection.cursor() as cur:
                cur.execute(query, params)
                if cur.description:  # Query returns rows
                    return cur.fetchall()
                return None
        
        try:
            if conn:
                return _execute(conn)
            else:
                with self.get_connection() as connection:
                    return _execute(connection)
        except Exception as e:
            self.logger.error("Query execution failed", error=str(e))
            raise
    
    def call_function(
        self,
        function_name: str,
        args: Optional[Tuple] = None,
        conn: Optional[Connection] = None
    ) -> Any:
        """
        Call a PostgreSQL function.
        
        Args:
            function_name: Name of function to call
            args: Function arguments
            conn: Optional connection
        
        Returns:
            Function result
        """
        self.metrics.start_timer(f"db_function_{function_name}")
        
        placeholders = ", ".join(["%s"] * len(args)) if args else ""
        query = f"SELECT {function_name}({placeholders})"
        
        try:
            result = self.execute_query(query, args, conn)
            self.metrics.stop_timer(f"db_function_{function_name}")
            
            if result:
                return result[0][0] if len(result[0]) == 1 else result[0]
            return None
        except Exception as e:
            self.metrics.stop_timer(f"db_function_{function_name}")
            raise
    
    def get_existing_recognition_ids(self, conn: Optional[Connection] = None) -> set:
        """Get set of all recognition IDs in database."""
        # Check if table exists first
        check_query = """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'recognitions'
            )
        """
        
        try:
            result = self.execute_query(check_query, conn=conn)
            if not result or not result[0][0]:
                # Table doesn't exist yet
                return set()
            
            # Table exists, get IDs
            query = "SELECT id FROM recognitions"
            results = self.execute_query(query, conn=conn)
            return {row[0] for row in results} if results else set()
        except Exception as e:
            self.logger.warning("Could not check existing recognitions", error=str(e))
            return set()
    
    def get_recognition_ids_by_batch(
        self,
        batch_id: str,
        conn: Optional[Connection] = None
    ) -> List[int]:
        """Get recognition IDs for a specific batch."""
        query = "SELECT recognition_id FROM raw.recognition_files WHERE batch_id = %s"
        results = self.execute_query(query, (batch_id,), conn=conn)
        return [row[0] for row in results] if results else []
    
    def delete_batch_data(
        self,
        batch_id: str,
        conn: Optional[Connection] = None
    ) -> dict:
        """
        Delete all data for a batch.
        Preserves user-created data (annotations, current_tray_items, work_items).
        
        Args:
            batch_id: Batch ID to delete
            conn: Optional connection
        
        Returns:
            Dict with counts of deleted records
        """
        self.logger.info(f"Deleting batch data", batch_id=batch_id)
        
        def _delete(connection):
            with connection.cursor() as cur:
                counts = {}
                
                # Get recognition IDs first
                cur.execute(
                    "SELECT recognition_id FROM raw.recognition_files WHERE batch_id = %s",
                    (batch_id,)
                )
                recognition_ids = [row[0] for row in cur.fetchall()]
                counts["recognition_ids"] = len(recognition_ids)
                
                if not recognition_ids:
                    self.logger.warning("No recognition IDs found for batch", batch_id=batch_id)
                    return counts
                
                # Check for user-created data
                cur.execute("""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name IN ('work_annotations', 'work_items', 'current_tray_items')
                """)
                has_work_tables = cur.fetchone()[0] > 0
                
                if has_work_tables:
                    # Check if there are any user annotations/work items for these recognitions
                    cur.execute("""
                        SELECT COUNT(*) FROM work_items 
                        WHERE recognition_id = ANY(%s)
                    """, (recognition_ids,))
                    work_items_count = cur.fetchone()[0]
                    
                    if work_items_count > 0:
                        self.logger.warning(
                            f"Found {work_items_count} user work items for these recognitions. "
                            "Preserving user data and only deleting initial data."
                        )
                        counts["user_data_preserved"] = work_items_count
                
                # Delete in safe order - respect FK dependencies
                
                # 1. Delete validation session items (safe - these are session-specific)
                # Check if table exists first to avoid transaction abort
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = 'validation_session_items'
                    )
                """)
                if cur.fetchone()[0]:
                    cur.execute(
                        "DELETE FROM validation_session_items WHERE recognition_id = ANY(%s)",
                        (recognition_ids,)
                    )
                    counts["validation_session_items"] = cur.rowcount
                
                # 2. Delete initial_annotations (depend on initial_tray_items)
                cur.execute(
                    "DELETE FROM initial_annotations WHERE image_id IN "
                    "(SELECT id FROM images WHERE recognition_id = ANY(%s))",
                    (recognition_ids,)
                )
                counts["initial_annotations"] = cur.rowcount
                
                # 3. Delete initial_tray_items (depend on recipe_line_options)
                cur.execute(
                    "DELETE FROM initial_tray_items WHERE recognition_id = ANY(%s)",
                    (recognition_ids,)
                )
                counts["initial_tray_items"] = cur.rowcount
                
                # 4. Delete recipe structure (now safe - no more references)
                cur.execute(
                    "DELETE FROM recipe_line_options WHERE recipe_line_id IN "
                    "(SELECT id FROM recipe_lines WHERE recipe_id IN "
                    "(SELECT id FROM recipes WHERE recognition_id = ANY(%s)))",
                    (recognition_ids,)
                )
                counts["recipe_line_options"] = cur.rowcount
                
                cur.execute(
                    "DELETE FROM recipe_lines WHERE recipe_id IN "
                    "(SELECT id FROM recipes WHERE recognition_id = ANY(%s))",
                    (recognition_ids,)
                )
                counts["recipe_lines"] = cur.rowcount
                
                cur.execute(
                    "DELETE FROM recipes WHERE recognition_id = ANY(%s)",
                    (recognition_ids,)
                )
                counts["recipes"] = cur.rowcount
                
                # 5. Delete active menu items (safe - from raw data)
                cur.execute(
                    "DELETE FROM recognition_active_menu_items WHERE recognition_id = ANY(%s)",
                    (recognition_ids,)
                )
                counts["menu_items"] = cur.rowcount
                
                # 5. Delete images and recognitions
                # Note: This will CASCADE to annotations, but only if no work_items reference them
                # Since work_annotations reference images, images won't delete if work exists
                try:
                    cur.execute(
                        "DELETE FROM images WHERE recognition_id = ANY(%s)",
                        (recognition_ids,)
                    )
                    counts["images"] = cur.rowcount
                except Exception as e:
                    # If delete fails due to FK constraint, it means user data exists
                    self.logger.warning(f"Could not delete images (user data exists)", error=str(e))
                    counts["images"] = 0
                    counts["images_preserved_for_user_data"] = True
                
                try:
                    cur.execute(
                        "DELETE FROM recognitions WHERE id = ANY(%s)",
                        (recognition_ids,)
                    )
                    counts["recognitions"] = cur.rowcount
                except Exception as e:
                    # If delete fails, user data exists
                    self.logger.warning(f"Could not delete recognitions (user data exists)", error=str(e))
                    counts["recognitions"] = 0
                    counts["recognitions_preserved_for_user_data"] = True
                
                # 6. Delete raw tables (always safe to delete)
                cur.execute(
                    "DELETE FROM raw.qwen_annotations WHERE recognition_id = ANY(%s)",
                    (recognition_ids,)
                )
                counts["qwen_annotations"] = cur.rowcount
                
                cur.execute(
                    "DELETE FROM raw.recipes WHERE recognition_id = ANY(%s)",
                    (recognition_ids,)
                )
                counts["recipes_raw"] = cur.rowcount
                
                cur.execute(
                    "DELETE FROM raw.recognition_files WHERE batch_id = %s",
                    (batch_id,)
                )
                counts["recognition_files"] = cur.rowcount
                
                return counts
        
        try:
            if conn:
                return _delete(conn)
            else:
                with self.get_connection() as connection:
                    result = _delete(connection)
                    connection.commit()
                    return result
        except Exception as e:
            self.logger.error("Failed to delete batch data", error=str(e))
            raise
    
    def transform_recognitions_and_images(self, conn: Optional[Connection] = None) -> Tuple[int, int, int]:
        """Call transform function for recognitions and images."""
        self.logger.info("Transforming recognitions and images")
        result = self.call_function("transform_recognitions_and_images", (), conn)
        
        if isinstance(result, tuple) and len(result) == 3:
            rec_count, img_count, menu_count = result
            self.logger.success(
                "Transform complete",
                recognitions=rec_count,
                images=img_count,
                menu_items=menu_count
            )
            return rec_count, img_count, menu_count
        return 0, 0, 0
    
    def transform_recipes(self, conn: Optional[Connection] = None) -> Tuple[int, int, int]:
        """Call transform function for recipes."""
        self.logger.info("Transforming recipes")
        result = self.call_function("transform_recipes", (), conn)
        
        if isinstance(result, tuple) and len(result) == 3:
            rec_count, line_count, opt_count = result
            self.logger.success(
                "Transform complete",
                recipes=rec_count,
                lines=line_count,
                options=opt_count
            )
            return rec_count, line_count, opt_count
        return 0, 0, 0
    
    def transform_initial_items_and_annotations(self, conn: Optional[Connection] = None) -> Tuple[int, int]:
        """Call transform function for initial items and annotations."""
        self.logger.info("Transforming initial items and annotations")
        result = self.call_function("transform_initial_items_and_annotations", (), conn)
        
        if isinstance(result, tuple) and len(result) == 2:
            item_count, ann_count = result
            self.logger.success(
                "Transform complete",
                items=item_count,
                annotations=ann_count
            )
            return item_count, ann_count
        return 0, 0
    
    def close(self):
        """Close all connections in pool."""
        if hasattr(self, 'pool') and self.pool:
            self.pool.closeall()
            self.logger.info("Database connection pool closed")

