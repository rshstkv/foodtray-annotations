"""
Performance metrics collection and reporting.
Tracks throughput, timing, and resource usage.
"""
import sys
import time
from dataclasses import dataclass, field
from typing import Dict, Optional
from threading import Lock


@dataclass
class TimerMetric:
    """Tracks timing for an operation."""
    start_time: Optional[float] = None
    total_time: float = 0.0
    count: int = 0
    
    def start(self):
        """Start timing."""
        self.start_time = time.time()
    
    def stop(self):
        """Stop timing and record duration."""
        if self.start_time is not None:
            duration = time.time() - self.start_time
            self.total_time += duration
            self.count += 1
            self.start_time = None
            return duration
        return 0.0
    
    def average(self) -> float:
        """Get average time per operation."""
        return self.total_time / self.count if self.count > 0 else 0.0


@dataclass
class CounterMetric:
    """Tracks counts and rates."""
    count: int = 0
    start_time: float = field(default_factory=time.time)
    
    def increment(self, amount: int = 1):
        """Increment counter."""
        self.count += amount
    
    def rate(self) -> float:
        """Calculate items per second."""
        elapsed = time.time() - self.start_time
        return self.count / elapsed if elapsed > 0 else 0.0


class MetricsCollector:
    """
    Collects and reports performance metrics.
    Thread-safe for concurrent operations.
    """
    
    def __init__(self):
        self._timers: Dict[str, TimerMetric] = {}
        self._counters: Dict[str, CounterMetric] = {}
        self._lock = Lock()
        self._start_time = time.time()
    
    def start_timer(self, name: str):
        """Start a named timer."""
        with self._lock:
            if name not in self._timers:
                self._timers[name] = TimerMetric()
            self._timers[name].start()
    
    def stop_timer(self, name: str) -> float:
        """Stop a named timer and return duration."""
        with self._lock:
            if name in self._timers:
                return self._timers[name].stop()
        return 0.0
    
    def record_count(self, name: str, amount: int = 1):
        """Record a count increment."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = CounterMetric()
            self._counters[name].increment(amount)
    
    def get_count(self, name: str) -> int:
        """Get current count."""
        with self._lock:
            return self._counters.get(name, CounterMetric()).count
    
    def get_rate(self, name: str) -> float:
        """Get current rate (items/second)."""
        with self._lock:
            counter = self._counters.get(name)
            return counter.rate() if counter else 0.0
    
    def get_timer_stats(self, name: str) -> Dict[str, float]:
        """Get timer statistics."""
        with self._lock:
            timer = self._timers.get(name)
            if timer:
                return {
                    "total": timer.total_time,
                    "count": timer.count,
                    "average": timer.average(),
                }
        return {"total": 0.0, "count": 0, "average": 0.0}
    
    def elapsed_time(self) -> float:
        """Get total elapsed time since initialization."""
        return time.time() - self._start_time
    
    def format_summary(self) -> str:
        """Format complete metrics summary."""
        with self._lock:
            lines = ["", "Performance Metrics:", "=" * 50]
            
            # Overall timing
            total_time = self.elapsed_time()
            lines.append(f"Total execution time: {self._format_duration(total_time)}")
            lines.append("")
            
            # Counters with rates
            if self._counters:
                lines.append("Throughput:")
                for name, counter in sorted(self._counters.items()):
                    rate = counter.rate()
                    lines.append(f"  {name}: {counter.count:,} ({rate:.1f}/s)")
                lines.append("")
            
            # Timers
            if self._timers:
                lines.append("Operation timings:")
                for name, timer in sorted(self._timers.items()):
                    if timer.count > 0:
                        avg = timer.average()
                        lines.append(
                            f"  {name}: {timer.count} ops, "
                            f"avg {avg:.3f}s, total {timer.total_time:.1f}s"
                        )
                lines.append("")
            
            lines.append("=" * 50)
            return "\n".join(lines)
    
    @staticmethod
    def _format_duration(seconds: float) -> str:
        """Format duration in human-readable format."""
        if seconds < 60:
            return f"{seconds:.1f}s"
        elif seconds < 3600:
            minutes = seconds / 60
            return f"{minutes:.1f}m"
        else:
            hours = seconds / 3600
            return f"{hours:.1f}h"


class ProgressBar:
    """
    Real-time progress bar with ETA calculation.
    Displays current progress and performance metrics.
    """
    
    def __init__(self, total: int, desc: str = "", width: int = 40):
        self.total = total
        self.desc = desc
        self.width = width
        self.current = 0
        self.start_time = time.time()
        self._lock = Lock()
    
    def update(self, amount: int = 1):
        """Update progress by amount."""
        with self._lock:
            self.current += amount
            self._render()
    
    def set_progress(self, current: int):
        """Set absolute progress value."""
        with self._lock:
            self.current = current
            self._render()
    
    def _render(self):
        """Render progress bar to stdout."""
        if self.total == 0:
            return
        
        # Calculate progress
        progress = self.current / self.total
        filled = int(self.width * progress)
        bar = "█" * filled + "░" * (self.width - filled)
        
        # Calculate rate and ETA
        elapsed = time.time() - self.start_time
        rate = self.current / elapsed if elapsed > 0 else 0
        remaining = (self.total - self.current) / rate if rate > 0 else 0
        
        # Format output
        percentage = progress * 100
        eta_str = self._format_time(remaining)
        
        output = (
            f"\r{self.desc} {bar} {percentage:.1f}% | "
            f"{self.current:,}/{self.total:,} | "
            f"{rate:.1f}/s | ETA: {eta_str}"
        )
        
        # Write to stdout
        sys.stdout.write(output)
        sys.stdout.flush()
    
    def finish(self):
        """Complete progress bar and add newline."""
        with self._lock:
            self.current = self.total
            self._render()
            sys.stdout.write("\n")
            sys.stdout.flush()
    
    @staticmethod
    def _format_time(seconds: float) -> str:
        """Format time in human-readable format."""
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            minutes = int(seconds / 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds / 3600)
            minutes = int((seconds % 3600) / 60)
            return f"{hours}h {minutes}m"

