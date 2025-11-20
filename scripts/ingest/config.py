"""
Configuration management for data ingestion system.
Handles environment variables, constants, and runtime parameters.
"""
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List
from dotenv import load_dotenv


# Environment types
ENV_LOCAL = "local"
ENV_PRODUCTION = "production"


@dataclass
class IngestConfig:
    """Central configuration for data ingestion."""
    
    # Environment
    environment: str
    supabase_url: str
    supabase_key: str
    database_url: str
    
    # Performance tuning
    thread_count: int = 16
    batch_size: int = 50
    retry_max_attempts: int = 5
    retry_backoff_factor: float = 2.0
    connection_pool_size: int = 10
    
    # Paths
    dataset_search_paths: Optional[List[Path]] = None
    
    # Storage
    storage_bucket: str = "rrs-photos"
    storage_temp_prefix: str = "temp"
    
    # Database
    db_connect_timeout: int = 30
    
    # Rate limiting (internal use, set via benchmark or profile)
    _rate_limit_strategy: str = "adaptive"  # "none", "fixed", "adaptive"
    _rate_limit_delay: float = 0.0  # Initial delay for fixed/adaptive
    
    def __post_init__(self):
        if self.dataset_search_paths is None:
            self.dataset_search_paths = [
                Path.cwd() / "RRS_Dataset 2",
                Path.home() / "Downloads" / "RRS_Dataset 2",
                Path.home() / "RRS_Dataset 2",
            ]
    
    @classmethod
    def from_env(
        cls, 
        use_production: bool = False,
        profile: str = "balanced"
    ) -> "IngestConfig":
        """
        Load configuration from environment variables.
        
        Args:
            use_production: Use production environment
            profile: Performance profile - "safe", "balanced", "fast", or "custom"
        """
        project_root = Path(__file__).parent.parent.parent
        
        # Determine which env file to load
        if use_production:
            env_path = project_root / ".env.production"
            environment = ENV_PRODUCTION
        else:
            env_path = project_root / ".env.local"
            if not env_path.exists():
                env_path = project_root / ".env.production"
                environment = ENV_PRODUCTION
            else:
                environment = ENV_LOCAL
        
        # Load environment file
        if env_path.exists():
            load_dotenv(env_path)
        
        # Extract required variables
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        database_url = os.getenv("DATABASE_URL")
        
        # Validate required variables
        if not all([supabase_url, supabase_key, database_url]):
            missing = []
            if not supabase_url:
                missing.append("NEXT_PUBLIC_SUPABASE_URL")
            if not supabase_key:
                missing.append("SUPABASE_SERVICE_ROLE_KEY")
            if not database_url:
                missing.append("DATABASE_URL")
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        
        # Apply performance profile
        if profile == "safe":
            thread_count = 2
            batch_size = 50
            rate_strategy = "adaptive"
            rate_delay = 0.0
        elif profile == "balanced":
            thread_count = 1
            batch_size = 50
            rate_strategy = "none"
            rate_delay = 0.0
        elif profile == "fast":
            thread_count = 12
            batch_size = 100
            rate_strategy = "adaptive"
            rate_delay = 0.0
        else:  # custom or legacy
            # Legacy behavior: conservative for production, aggressive for local
            thread_count = 1 if use_production else 16
            batch_size = 10 if use_production else 100
            rate_strategy = "fixed" if use_production else "none"
            rate_delay = 0.1 if use_production else 0.0
        
        config = cls(
            environment=environment,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
            database_url=database_url,
            thread_count=thread_count,
            batch_size=batch_size,
        )
        
        # Set rate limiting parameters
        config._rate_limit_strategy = rate_strategy
        config._rate_limit_delay = rate_delay
        
        return config
    
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == ENV_PRODUCTION


# Message constants
MSG_LOADING_ENV = "Loading environment configuration"
MSG_CONNECTING_DB = "Establishing database connection"
MSG_CONNECTING_STORAGE = "Connecting to storage"
MSG_PROCESSING_DATA = "Processing dataset"
MSG_UPLOAD_COMPLETE = "Upload completed successfully"
MSG_ROLLBACK = "Rolling back transaction"
MSG_CLEANUP = "Cleaning up resources"

# Error messages
ERR_DATASET_NOT_FOUND = "Dataset not found in any search path"
ERR_CONNECTION_FAILED = "Failed to establish connection"
ERR_UPLOAD_FAILED = "Upload operation failed"
ERR_TRANSACTION_FAILED = "Transaction failed, rolling back"

# Status indicators
STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_COMPLETE = "complete"
STATUS_FAILED = "failed"
STATUS_ROLLED_BACK = "rolled_back"

