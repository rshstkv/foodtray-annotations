"""
Multithreaded data processor for parallel recognition processing.
Handles dataset scanning, image processing, and data preparation.
"""
import json
from pathlib import Path
from typing import List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import io

from .config import IngestConfig
from .logger import get_logger
from .metrics import MetricsCollector, ProgressBar
from .transaction import RecognitionData


class DatasetScanner:
    """Scans dataset directory for recognition data."""
    
    def __init__(self, config: IngestConfig):
        self.config = config
        self.logger = get_logger()
    
    def find_dataset(self) -> Path:
        """Find dataset in configured search paths."""
        for path in self.config.dataset_search_paths:
            if path.exists():
                self.logger.info(f"Dataset found", path=str(path))
                return path
        
        paths_str = ", ".join(str(p) for p in self.config.dataset_search_paths)
        raise FileNotFoundError(f"Dataset not found in: {paths_str}")
    
    def scan_recognitions(
        self,
        dataset_path: Path,
        limit: Optional[int] = None
    ) -> List[Path]:
        """
        Scan dataset for recognition directories.
        
        Args:
            dataset_path: Root dataset path
            limit: Optional limit on number of recognitions
        
        Returns:
            List of recognition directory paths
        """
        self.logger.info("Scanning dataset for recognitions")
        
        recognition_dirs = []
        
        # Check for export_* subdirectories first
        export_dirs = sorted([
            d for d in dataset_path.iterdir()
            if d.is_dir() and d.name.startswith('export_')
        ])
        
        if export_dirs:
            self.logger.info(f"Found export directory", name=export_dirs[0].name)
            recognition_dirs = sorted([
                d for d in export_dirs[0].iterdir()
                if d.is_dir() and d.name.startswith('recognition_')
            ])
        else:
            # Try direct recognition_* directories
            recognition_dirs = sorted([
                d for d in dataset_path.iterdir()
                if d.is_dir() and (d.name.isdigit() or d.name.startswith('recognition_'))
            ])
        
        if limit:
            recognition_dirs = recognition_dirs[:limit]
        
        self.logger.info(f"Found recognition directories", count=len(recognition_dirs))
        return recognition_dirs


class RecognitionProcessor:
    """Processes individual recognition directories."""
    
    def __init__(self, config: IngestConfig, metrics: MetricsCollector):
        self.config = config
        self.metrics = metrics
        self.logger = get_logger()
    
    def process_recognition(
        self,
        recognition_dir: Path,
        batch_id: str
    ) -> Optional[RecognitionData]:
        """
        Process a single recognition directory.
        
        Args:
            recognition_dir: Path to recognition directory
            batch_id: Batch identifier for this load
        
        Returns:
            RecognitionData if successful, None otherwise
        """
        try:
            self.metrics.start_timer("process_recognition")
            
            # Extract recognition ID
            recognition_id = self._extract_recognition_id(recognition_dir)
            
            # Load active menu (AM.json)
            active_menu = self._load_active_menu(recognition_dir)
            
            # Load recipe (correct_dishes.json)
            recipe = self._load_recipe(recognition_dir)
            
            # Find and process images
            image_data = self._process_images(recognition_dir, recognition_id)
            
            if not image_data:
                return None
            
            # Create RecognitionData object
            result = RecognitionData(
                recognition_id=recognition_id,
                batch_id=batch_id,
                active_menu=json.dumps(active_menu) if active_menu else None,
                image1_path=image_data[0][0],
                image2_path=image_data[1][0],
                image1_width=image_data[0][1],
                image1_height=image_data[0][2],
                image2_width=image_data[1][1],
                image2_height=image_data[1][2],
                image1_data=image_data[0][3],
                image2_data=image_data[1][3],
                recipe_payload=recipe
            )
            
            self.metrics.stop_timer("process_recognition")
            self.metrics.record_count("recognitions_processed", 1)
            
            return result
            
        except Exception as e:
            self.logger.warning(
                f"Failed to process recognition",
                dir=recognition_dir.name,
                error=str(e)
            )
            self.metrics.record_count("recognitions_failed", 1)
            return None
    
    def _extract_recognition_id(self, recognition_dir: Path) -> int:
        """Extract recognition ID from directory name."""
        dir_name = recognition_dir.name
        if dir_name.startswith('recognition_'):
            return int(dir_name.replace('recognition_', ''))
        return int(dir_name)
    
    def _load_active_menu(self, recognition_dir: Path) -> Optional[dict]:
        """Load active menu JSON file."""
        # Try multiple file patterns
        am_files = (
            list(recognition_dir.glob("*_AM.json")) +
            list(recognition_dir.glob("AM.json"))
        )
        
        if am_files:
            with open(am_files[0], 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return None
    
    def _load_recipe(self, recognition_dir: Path) -> Optional[dict]:
        """Load recipe/correct_dishes JSON file."""
        recipe_files = (
            list(recognition_dir.glob("*_correct_dishes.json")) +
            list(recognition_dir.glob("CD.json"))
        )
        
        if recipe_files:
            with open(recipe_files[0], 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return None
    
    def _process_images(
        self,
        recognition_dir: Path,
        recognition_id: int
    ) -> Optional[List[Tuple[str, int, int, bytes]]]:
        """
        Find and process images for recognition.
        
        Returns:
            List of (filename, width, height, bytes) tuples or None
        """
        # Find images in photos/ subdirectory or root
        photos_dir = recognition_dir / "photos"
        if photos_dir.exists():
            image_files = list(photos_dir.glob("*.jpg")) + list(photos_dir.glob("*.jpeg"))
        else:
            image_files = list(recognition_dir.glob("*.jpg")) + list(recognition_dir.glob("*.jpeg"))
        
        if len(image_files) != 2:
            self.logger.warning(
                f"Expected 2 images, found {len(image_files)}",
                recognition_id=recognition_id
            )
            return None
        
        # Sort to ensure consistent ordering
        image_files.sort()
        
        # Process both images
        results = []
        for idx, img_path in enumerate(image_files, start=1):
            try:
                # Read image
                with Image.open(img_path) as img:
                    width, height = img.width, img.height
                    
                    # Convert to RGB if needed
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Save to bytes
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=85)
                    image_bytes = buffer.getvalue()
                
                filename = f"camera{idx}.jpg"
                results.append((filename, width, height, image_bytes))
                
                self.metrics.record_count("images_processed", 1)
                self.metrics.record_count("bytes_processed", len(image_bytes))
                
            except Exception as e:
                self.logger.warning(
                    f"Failed to process image",
                    file=img_path.name,
                    error=str(e)
                )
                return None
        
        return results if len(results) == 2 else None


class ParallelDataProcessor:
    """
    Coordinates parallel processing of recognition data.
    Uses ThreadPoolExecutor for concurrent processing.
    """
    
    def __init__(
        self,
        config: IngestConfig,
        metrics: MetricsCollector,
        max_workers: Optional[int] = None
    ):
        self.config = config
        self.metrics = metrics
        self.logger = get_logger()
        self.max_workers = max_workers or config.thread_count
        
        self.scanner = DatasetScanner(config)
        self.processor = RecognitionProcessor(config, metrics)
    
    def process_dataset(
        self,
        dataset_path: Optional[Path] = None,
        batch_id: str = "manual_load",
        limit: Optional[int] = None,
        existing_ids: Optional[set] = None,
        force_reupload: bool = False
    ) -> List[RecognitionData]:
        """
        Process entire dataset in parallel.
        
        Args:
            dataset_path: Path to dataset (auto-detected if None)
            batch_id: Batch identifier
            limit: Limit number of recognitions
            existing_ids: Set of existing recognition IDs (for incremental load)
            force_reupload: Force reupload of existing recognitions
        
        Returns:
            List of successfully processed RecognitionData
        """
        # Find dataset
        if dataset_path is None:
            dataset_path = self.scanner.find_dataset()
        
        # Scan for recognitions
        recognition_dirs = self.scanner.scan_recognitions(dataset_path, limit)
        
        if not recognition_dirs:
            self.logger.warning("No recognitions found in dataset")
            return []
        
        # Filter out existing recognitions (unless force_reupload)
        if existing_ids and not force_reupload:
            original_count = len(recognition_dirs)
            recognition_dirs = [
                d for d in recognition_dirs
                if self._extract_id_from_path(d) not in existing_ids
            ]
            skipped = original_count - len(recognition_dirs)
            if skipped > 0:
                self.logger.info(
                    f"Skipping existing recognitions",
                    skipped=skipped,
                    new=len(recognition_dirs)
                )
        
        if not recognition_dirs:
            self.logger.info("No new recognitions to process")
            return []
        
        # Process in parallel with progress tracking
        self.logger.info(
            f"Processing recognitions in parallel",
            workers=self.max_workers,
            total=len(recognition_dirs)
        )
        
        results = []
        progress = ProgressBar(
            total=len(recognition_dirs),
            desc="Processing",
            width=40
        )
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tasks
            futures = {
                executor.submit(
                    self.processor.process_recognition,
                    rec_dir,
                    batch_id
                ): rec_dir
                for rec_dir in recognition_dirs
            }
            
            # Collect results as they complete
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                except Exception as e:
                    rec_dir = futures[future]
                    self.logger.warning(
                        f"Processing failed",
                        dir=rec_dir.name,
                        error=str(e)
                    )
                
                progress.update(1)
        
        progress.finish()
        
        self.logger.success(
            "Processing complete",
            successful=len(results),
            failed=len(recognition_dirs) - len(results)
        )
        
        return results
    
    def _extract_id_from_path(self, path: Path) -> int:
        """Extract recognition ID from path."""
        dir_name = path.name
        if dir_name.startswith('recognition_'):
            return int(dir_name.replace('recognition_', ''))
        return int(dir_name)

