"""
Structured logging system without print statements.
Provides consistent, timestamped, level-based logging.
"""
import sys
from datetime import datetime
from enum import Enum
from typing import Optional


class LogLevel(Enum):
    """Log severity levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class StructuredLogger:
    """
    Professional logging system with structured output.
    Avoids print statements and provides consistent formatting.
    """
    
    def __init__(self, min_level: LogLevel = LogLevel.INFO, show_timestamp: bool = True):
        self.min_level = min_level
        self.show_timestamp = show_timestamp
        self._level_order = {
            LogLevel.DEBUG: 0,
            LogLevel.INFO: 1,
            LogLevel.SUCCESS: 1,
            LogLevel.WARNING: 2,
            LogLevel.ERROR: 3,
        }
    
    def _should_log(self, level: LogLevel) -> bool:
        """Check if message should be logged based on level."""
        return self._level_order[level] >= self._level_order[self.min_level]
    
    def _format_message(self, level: LogLevel, message: str, details: Optional[dict] = None) -> str:
        """Format log message with consistent structure."""
        parts = []
        
        # Timestamp
        if self.show_timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            parts.append(f"[{timestamp}]")
        
        # Level
        parts.append(f"[{level.value}]")
        
        # Message
        parts.append(message)
        
        # Details (key=value format)
        if details:
            detail_strs = [f"{k}={v}" for k, v in details.items()]
            parts.append(f"({', '.join(detail_strs)})")
        
        return " ".join(parts)
    
    def _write(self, level: LogLevel, message: str, details: Optional[dict] = None):
        """Write log message to appropriate stream."""
        if not self._should_log(level):
            return
        
        formatted = self._format_message(level, message, details)
        
        # Errors and warnings go to stderr, everything else to stdout
        stream = sys.stderr if level in [LogLevel.ERROR, LogLevel.WARNING] else sys.stdout
        stream.write(formatted + "\n")
        stream.flush()
    
    def debug(self, message: str, **details):
        """Log debug message."""
        self._write(LogLevel.DEBUG, message, details or None)
    
    def info(self, message: str, **details):
        """Log info message."""
        self._write(LogLevel.INFO, message, details or None)
    
    def success(self, message: str, **details):
        """Log success message."""
        self._write(LogLevel.SUCCESS, message, details or None)
    
    def warning(self, message: str, **details):
        """Log warning message."""
        self._write(LogLevel.WARNING, message, details or None)
    
    def error(self, message: str, **details):
        """Log error message."""
        self._write(LogLevel.ERROR, message, details or None)
    
    def section(self, title: str):
        """Log section header."""
        separator = "=" * 60
        self._write(LogLevel.INFO, separator)
        self._write(LogLevel.INFO, title)
        self._write(LogLevel.INFO, separator)


# Global logger instance
_default_logger: Optional[StructuredLogger] = None


def get_logger() -> StructuredLogger:
    """Get or create default logger instance."""
    global _default_logger
    if _default_logger is None:
        _default_logger = StructuredLogger()
    return _default_logger


def set_logger(logger: StructuredLogger):
    """Set custom logger instance."""
    global _default_logger
    _default_logger = logger


# Convenience functions for global logger
def debug(message: str, **details):
    get_logger().debug(message, **details)


def info(message: str, **details):
    get_logger().info(message, **details)


def success(message: str, **details):
    get_logger().success(message, **details)


def warning(message: str, **details):
    get_logger().warning(message, **details)


def error(message: str, **details):
    get_logger().error(message, **details)


def section(title: str):
    get_logger().section(title)

