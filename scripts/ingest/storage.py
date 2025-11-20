"""
Storage manager with retry logic and batch operations.
Handles Supabase Storage uploads with fault tolerance.
"""
import time
import random
from functools import wraps
from typing import Optional, List, Tuple, Literal
from concurrent.futures import ThreadPoolExecutor, as_completed
from supabase import Client, create_client
import io
import threading

from .config import IngestConfig
from .logger import get_logger
from .metrics import MetricsCollector


def retry_with_backoff(max_attempts: int = 3, backoff_factor: float = 2.0):
    """
    Decorator for retry logic with exponential backoff and jitter.
    
    Args:
        max_attempts: Maximum number of retry attempts
        backoff_factor: Multiplier for delay between retries
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            delay = 1.0
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        logger = get_logger()
                        
                        # Add jitter to prevent thundering herd
                        jitter = random.uniform(0, 0.5)
                        actual_delay = delay + jitter
                        
                        logger.warning(
                            f"Attempt {attempt + 1} failed, retrying in {actual_delay:.2f}s",
                            error=str(e)
                        )
                        time.sleep(actual_delay)
                        delay *= backoff_factor
            
            # All attempts failed
            raise last_exception
        
        return wrapper
    return decorator


class AdaptiveRateLimiter:
    """
    Adaptive rate limiter that adjusts delay based on errors.
    Implements token bucket algorithm with exponential backoff on errors.
    """
    
    def __init__(
        self,
        initial_delay: float = 0.0,
        max_delay: float = 5.0,
        increase_factor: float = 2.0,
        decrease_factor: float = 0.5,
        success_threshold: int = 10
    ):
        """
        Initialize adaptive rate limiter.
        
        Args:
            initial_delay: Initial delay between requests (seconds)
            max_delay: Maximum delay (seconds)
            increase_factor: Factor to increase delay on error
            decrease_factor: Factor to decrease delay on success
            success_threshold: Number of successes before decreasing delay
        """
        self.current_delay = initial_delay
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.increase_factor = increase_factor
        self.decrease_factor = decrease_factor
        self.success_threshold = success_threshold
        
        self._success_count = 0
        self._error_count = 0
        self._lock = threading.Lock()
        
        self.logger = get_logger()
    
    def wait(self):
        """Wait according to current rate limit."""
        if self.current_delay > 0:
            # Add small jitter to prevent synchronization
            jitter = random.uniform(0, self.current_delay * 0.1)
            time.sleep(self.current_delay + jitter)
    
    def record_success(self):
        """Record successful operation."""
        with self._lock:
            self._success_count += 1
            
            # Decrease delay after threshold successes
            if self._success_count >= self.success_threshold and self.current_delay > 0:
                old_delay = self.current_delay
                self.current_delay = max(
                    self.initial_delay,
                    self.current_delay * self.decrease_factor
                )
                
                if old_delay != self.current_delay:
                    self.logger.info(
                        f"Rate limit decreased",
                        old=f"{old_delay:.3f}s",
                        new=f"{self.current_delay:.3f}s",
                        successes=self._success_count
                    )
                
                self._success_count = 0
    
    def record_error(self, error: Exception):
        """Record error and increase delay."""
        with self._lock:
            self._error_count += 1
            self._success_count = 0  # Reset success counter
            
            # Check if it's a rate limit error
            error_str = str(error).lower()
            is_rate_limit = (
                "429" in error_str or
                "rate limit" in error_str or
                "too many requests" in error_str
            )
            
            if is_rate_limit:
                old_delay = self.current_delay
                self.current_delay = min(
                    self.max_delay,
                    max(0.5, self.current_delay * self.increase_factor)
                )
                
                self.logger.warning(
                    f"Rate limit hit, increasing delay",
                    old=f"{old_delay:.3f}s",
                    new=f"{self.current_delay:.3f}s",
                    errors=self._error_count
                )
    
    def reset(self):
        """Reset rate limiter to initial state."""
        with self._lock:
            self.current_delay = self.initial_delay
            self._success_count = 0
            self._error_count = 0
    
    def get_stats(self) -> dict:
        """Get current statistics."""
        with self._lock:
            return {
                "current_delay": self.current_delay,
                "success_count": self._success_count,
                "error_count": self._error_count
            }


class StorageManager:
    """
    Manages Supabase Storage operations with retry logic and batch uploads.
    """
    
    def __init__(self, config: IngestConfig, metrics: Optional[MetricsCollector] = None):
        self.config = config
        self.metrics = metrics or MetricsCollector()
        self.logger = get_logger()
        
        # Initialize Supabase client
        self.client: Client = create_client(
            config.supabase_url,
            config.supabase_key
        )
        
        # Get storage client (property, not method in new Supabase version)
        self.storage_client = self.client.storage
        
        self._uploaded_files: List[str] = []
        self._temp_files: List[str] = []
        
        # Initialize adaptive rate limiter
        initial_delay = getattr(config, '_rate_limit_delay', 0.0)
        self.rate_limiter = AdaptiveRateLimiter(
            initial_delay=initial_delay,
            max_delay=5.0,
            increase_factor=2.0,
            decrease_factor=0.5,
            success_threshold=10
        )
    
    def test_connection(self) -> bool:
        """Test storage connection and create bucket if needed."""
        try:
            # Try to list files in the bucket to verify it exists
            objects = self.storage_client.from_(self.config.storage_bucket).list("")
            self.logger.info("Connected to storage", bucket=self.config.storage_bucket)
            return True
        except Exception as e:
            error_str = str(e)
            
            # If bucket doesn't exist, try to create it
            if "not found" in error_str.lower() or "bucket not found" in error_str.lower():
                self.logger.info(f"Bucket not found, creating", bucket=self.config.storage_bucket)
                try:
                    self.storage_client.create_bucket(
                        self.config.storage_bucket,
                        options={"public": True}
                    )
                    self.logger.success("Bucket created", bucket=self.config.storage_bucket)
                    return True
                except Exception as create_error:
                    create_error_str = str(create_error)
                    if "already exists" in create_error_str.lower():
                        # Race condition - bucket was created by another process
                        self.logger.info("Bucket already exists", bucket=self.config.storage_bucket)
                        return True
                    self.logger.error("Failed to create bucket", error=create_error_str)
                    return False
            
            self.logger.error("Storage connection failed", error=error_str)
            return False
    
    def file_exists(self, path: str) -> bool:
        """
        Check if file exists in storage.
        
        Args:
            path: Storage path (e.g., "recognitions/12345/camera1.jpg")
        """
        try:
            # Extract folder and filename
            parts = path.rsplit("/", 1)
            if len(parts) != 2:
                return False
            
            folder_path, filename = parts
            
            # List files in folder
            objects = self.storage_client.from_(self.config.storage_bucket).list(folder_path)
            
            # Check if our file is in the list
            if objects:
                return any(obj.get("name") == filename for obj in objects)
            
            return False
        except Exception:
            return False
    
    def upload_file(
        self,
        storage_path: str,
        data: bytes,
        content_type: str = "image/jpeg",
        use_temp: bool = False,
        use_rate_limit: bool = True
    ) -> bool:
        """
        Upload file to storage with retry logic and rate limiting.
        
        Args:
            storage_path: Destination path in storage
            data: File content as bytes
            content_type: MIME type
            use_temp: If True, upload to temporary location
            use_rate_limit: If True, apply rate limiting
        
        Returns:
            True if successful
        """
        if use_temp:
            storage_path = f"{self.config.storage_temp_prefix}/{storage_path}"
        
        # Apply rate limiting
        rate_strategy = getattr(self.config, '_rate_limit_strategy', 'adaptive')
        if use_rate_limit and rate_strategy != 'none':
            self.rate_limiter.wait()
        
        try:
            self.metrics.start_timer("storage_upload")
            
            # Retry logic with exponential backoff
            max_attempts = 3
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    # Upload to storage
                    self.storage_client.from_(self.config.storage_bucket).upload(
                        path=storage_path,
                        file=data,
                        file_options={"content-type": content_type, "upsert": "true"}
                    )
                    
                    # Track uploaded file
                    if use_temp:
                        self._temp_files.append(storage_path)
                    else:
                        self._uploaded_files.append(storage_path)
                    
                    # Record metrics
                    self.metrics.stop_timer("storage_upload")
                    self.metrics.record_count("bytes_uploaded", len(data))
                    
                    # Record success for adaptive rate limiting
                    if rate_strategy == 'adaptive':
                        self.rate_limiter.record_success()
                    
                    return True
                    
                except Exception as e:
                    last_exception = e
                    
                    # If it's a duplicate, that's OK
                    if "Duplicate" in str(e) or "already exists" in str(e):
                        self._uploaded_files.append(storage_path)
                        self.metrics.stop_timer("storage_upload")
                        return True
                    
                    # Record error for adaptive rate limiting
                    if rate_strategy == 'adaptive':
                        self.rate_limiter.record_error(e)
                    
                    # Retry with backoff
                    if attempt < max_attempts - 1:
                        delay = (2.0 ** attempt) + random.uniform(0, 0.5)
                        self.logger.warning(
                            f"Upload attempt {attempt + 1} failed, retrying in {delay:.2f}s",
                            path=storage_path,
                            error=str(e)
                        )
                        time.sleep(delay)
            
            # All attempts failed
            self.metrics.stop_timer("storage_upload")
            raise last_exception
            
        except Exception as e:
            self.metrics.stop_timer("storage_upload")
            raise
    
    def batch_upload(
        self,
        files: List[Tuple[str, bytes]],
        use_temp: bool = False,
        max_workers: Optional[int] = None
    ) -> Tuple[int, int]:
        """
        Upload multiple files with adaptive strategy.
        
        Args:
            files: List of (path, data) tuples
            use_temp: Upload to temporary location
            max_workers: Number of parallel workers (default: config.thread_count)
        
        Returns:
            Tuple of (successful_count, failed_count)
        """
        if max_workers is None:
            max_workers = self.config.thread_count
        
        # Get rate limiting strategy
        rate_strategy = getattr(self.config, '_rate_limit_strategy', 'adaptive')
        
        # Choose upload strategy based on configuration
        if max_workers == 1:
            # Sequential upload
            return self._sequential_upload(files, use_temp)
        else:
            # Parallel upload with rate limiting
            return self._parallel_upload(files, use_temp, max_workers)
    
    def _sequential_upload(
        self,
        files: List[Tuple[str, bytes]],
        use_temp: bool = False
    ) -> Tuple[int, int]:
        """
        Upload files sequentially with adaptive rate limiting.
        """
        successful = 0
        failed = 0
        
        for path, data in files:
            try:
                if self.upload_file(path, data, use_temp=use_temp, use_rate_limit=True):
                    successful += 1
                else:
                    failed += 1
            except Exception as e:
                self.logger.warning(f"Upload failed for {path}", error=str(e))
                failed += 1
        
        return successful, failed
    
    def _parallel_upload(
        self,
        files: List[Tuple[str, bytes]],
        use_temp: bool,
        max_workers: int
    ) -> Tuple[int, int]:
        """
        Upload files in parallel with adaptive rate limiting.
        """
        successful = 0
        failed = 0
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all upload tasks
            futures = {
                executor.submit(
                    self.upload_file, 
                    path, 
                    data, 
                    use_temp=use_temp, 
                    use_rate_limit=True
                ): path
                for path, data in files
            }
            
            # Collect results
            for future in as_completed(futures):
                try:
                    if future.result():
                        successful += 1
                    else:
                        failed += 1
                except Exception as e:
                    path = futures[future]
                    self.logger.warning(f"Upload failed for {path}", error=str(e))
                    failed += 1
        
        return successful, failed
    
    @retry_with_backoff(max_attempts=3, backoff_factor=2.0)
    def move_file(self, source_path: str, dest_path: str) -> bool:
        """
        Move file from temp to permanent location.
        
        Args:
            source_path: Source path in storage
            dest_path: Destination path in storage
        """
        try:
            # Supabase doesn't have native move, so we copy and delete
            self.storage_client.from_(self.config.storage_bucket).move(
                source_path,
                dest_path
            )
            return True
        except Exception:
            # Fallback: manual copy + delete if move not supported
            try:
                # Download from source
                response = self.storage_client.from_(self.config.storage_bucket).download(source_path)
                
                # Upload to destination
                self.storage_client.from_(self.config.storage_bucket).upload(
                    path=dest_path,
                    file=response,
                    file_options={"upsert": "true"}
                )
                
                # Delete source
                self.storage_client.from_(self.config.storage_bucket).remove([source_path])
                
                return True
            except Exception as e:
                self.logger.error(f"Failed to move {source_path} to {dest_path}", error=str(e))
                raise
    
    @retry_with_backoff(max_attempts=3, backoff_factor=2.0)
    def delete_file(self, path: str) -> bool:
        """
        Delete file from storage.
        
        Args:
            path: Storage path to delete
        """
        try:
            self.storage_client.from_(self.config.storage_bucket).remove([path])
            return True
        except Exception as e:
            self.logger.warning(f"Failed to delete {path}", error=str(e))
            return False
    
    def delete_batch(self, paths: List[str]) -> Tuple[int, int]:
        """
        Delete multiple files.
        
        Returns:
            Tuple of (successful_count, failed_count)
        """
        successful = 0
        failed = 0
        
        # Supabase supports batch delete
        try:
            self.storage_client.from_(self.config.storage_bucket).remove(paths)
            successful = len(paths)
        except Exception as e:
            self.logger.warning("Batch delete failed, falling back to individual deletes", error=str(e))
            # Fallback: delete one by one
            for path in paths:
                if self.delete_file(path):
                    successful += 1
                else:
                    failed += 1
        
        return successful, failed
    
    def delete_recognition_files(self, recognition_id: int) -> bool:
        """
        Delete all files for a recognition.
        
        Args:
            recognition_id: Recognition ID to delete
        """
        try:
            # List all files in recognition folder
            folder_path = f"recognitions/{recognition_id}"
            objects = self.storage_client.from_(self.config.storage_bucket).list(folder_path)
            
            if objects:
                # Build full paths
                paths = [f"{folder_path}/{obj.get('name')}" for obj in objects if obj.get('name')]
                
                # Delete all files
                if paths:
                    self.delete_batch(paths)
            
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete files for recognition {recognition_id}", error=str(e))
            return False
    
    def commit_temp_files(self):
        """Move all temporary files to permanent location."""
        self.logger.info("Committing temporary files to permanent storage")
        
        for temp_path in self._temp_files:
            # Remove temp prefix to get permanent path
            perm_path = temp_path.replace(f"{self.config.storage_temp_prefix}/", "", 1)
            try:
                self.move_file(temp_path, perm_path)
                self._uploaded_files.append(perm_path)
            except Exception as e:
                self.logger.error(f"Failed to commit {temp_path}", error=str(e))
                raise
        
        self._temp_files.clear()
    
    def rollback_temp_files(self):
        """Delete all temporary files (cleanup on failure)."""
        if not self._temp_files:
            return
        
        self.logger.info("Rolling back temporary files", count=len(self._temp_files))
        self.delete_batch(self._temp_files)
        self._temp_files.clear()
    
    def get_uploaded_files(self) -> List[str]:
        """Get list of successfully uploaded files."""
        return self._uploaded_files.copy()

