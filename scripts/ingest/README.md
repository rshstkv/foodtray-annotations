# Professional Data Ingestion System v2.0

Enterprise-grade data loading system with multi-threading, fault tolerance, and performance metrics.

## Prerequisites

**ВАЖНО:** Перед первой загрузкой данных убедитесь, что применены все миграции:

```bash
# Локально
npx supabase db reset --local

# Или только применить миграции
npx supabase migration up --local
```

## Quick Start

```bash
# Check system status
python scripts/ingest/cli.py status

# Load recognitions (local environment)
python scripts/ingest/cli.py load --limit 100

# Load to production
python scripts/ingest/cli.py load --production

# Load Qwen annotations
python scripts/ingest/cli.py load-qwen --production

# Delete batch data (with confirmation)
python scripts/ingest/cli.py reset --batch-id batch_20251118_120000
```

## Features

### 🚀 High Performance
- **Multi-threading**: 16+ parallel workers for image processing
- **Bulk inserts**: PostgreSQL COPY for efficient data loading
- **Connection pooling**: Reusable database connections
- **Batch operations**: Parallelized storage uploads

### 🛡️ Fault Tolerance
- **Retry logic**: Exponential backoff for network errors (3 attempts)
- **Transactional**: Two-phase commit (Storage + Database)
- **Rollback support**: Automatic cleanup on failure
- **Error tracking**: Detailed error reporting with metrics

### 📊 Metrics & Monitoring
- **Real-time progress**: Visual progress bars with ETA
- **Performance tracking**: Throughput (records/s, MB/s)
- **Operation timing**: Detailed timing for each operation
- **Summary reports**: Complete metrics after completion

### 🔄 Smart Loading
- **Incremental**: Skips existing recognitions by default
- **Force mode**: `--force` flag to reload existing data
- **Batch tracking**: Each load gets unique batch ID
- **Idempotent**: Safe to re-run multiple times

## Commands

### load - Load Recognition Data

```bash
python scripts/ingest/cli.py load [OPTIONS]

Options:
  --source PATH        Dataset directory (auto-detected if not specified)
  --limit N            Limit number of recognitions to load
  --batch-id ID        Custom batch ID (auto-generated if not provided)
  --force              Force reload of existing recognitions
  --production         Use production environment
  --verbose            Enable verbose logging
```

**Example:**
```bash
# Load 1000 recognitions to production
python scripts/ingest/cli.py load --limit 1000 --production
```

### load-qwen - Load Qwen Annotations

```bash
python scripts/ingest/cli.py load-qwen [OPTIONS]

Options:
  --file PATH          Path to qwen_annotations.json (auto-detected if not specified)
  --production         Use production environment
```

### reset - Delete Batch Data

```bash
python scripts/ingest/cli.py reset --batch-id BATCH_ID [OPTIONS]

Options:
  --batch-id ID        Batch ID to delete (REQUIRED)
  --confirm            Skip confirmation prompt
  --production         Use production environment
```

**Example:**
```bash
# Delete specific batch with confirmation
python scripts/ingest/cli.py reset --batch-id manual_load --production
```

### status - System Status Check

```bash
python scripts/ingest/cli.py status [OPTIONS]

Options:
  --production         Use production environment
```

## Architecture

### Modular Design

- **config.py** - Configuration and environment management
- **logger.py** - Structured logging (no print statements)
- **metrics.py** - Performance metrics collection
- **storage.py** - Supabase Storage manager with retry logic
- **database.py** - PostgreSQL manager with connection pooling
- **transaction.py** - Two-phase transaction coordinator
- **processor.py** - Multi-threaded data processor
- **cli.py** - Unified command-line interface

### Data Flow

```
Dataset → Processor (parallel) → Transaction → Storage + Database
                                      ↓
                              Commit (atomic)
                                      ↓
                            Transform Functions
```

### Two-Phase Transactions

1. **Prepare Phase**:
   - Upload images to Storage
   - Insert data to database (not committed)

2. **Commit Phase**:
   - Commit database transaction
   - Run transform functions
   - Atomic operation across both systems

3. **Rollback** (on failure):
   - Rollback database
   - Delete temporary Storage files
   - Clean state guaranteed

## Configuration

Environment variables are loaded from:
- `.env.local` (local development)
- `.env.production` (production with `--production` flag)

Required variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://...
```

## Performance Tuning

Default configuration (can be modified in `config.py`):
```python
thread_count = 16              # Parallel workers
batch_size = 100               # Records per transaction
retry_max_attempts = 3         # Network retry attempts
retry_backoff_factor = 2.0     # Exponential backoff
connection_pool_size = 10      # DB connection pool
```

## Example Output

```
[INFO] Loading dataset from /path/to/dataset
[INFO] Environment: PRODUCTION
[INFO] Config: threads=16, batch_size=100, retry=3

Processing ████████████████░░░░ 80% | 8000/10000 | 1250/s | ETA: 1m 15s

[SUCCESS] Load completed successfully

Performance Metrics:
==================================================
Total execution time: 8m 32s

Throughput:
  recognitions_processed: 10,000 (19.5/s)
  images_processed: 20,000 (39.1/s)
  bytes_uploaded: 2,456,789,123 (4.8 MB/s)

Operation timings:
  storage_upload: 20000 ops, avg 0.042s, total 840.0s
  db_bulk_copy: 100 ops, avg 0.125s, total 12.5s

==================================================
```

## Troubleshooting

### Storage Connection Issues
```bash
# Check bucket exists in Supabase Dashboard
# Verify SUPABASE_SERVICE_ROLE_KEY has storage permissions
```

### Database Connection Issues
```bash
# Verify DATABASE_URL is correct
# Check migrations are applied: supabase migration up
# Ensure raw schema exists
```

### Slow Performance
```bash
# Increase thread count in config.py
# Check network bandwidth
# Verify database has proper indexes
```

## Migration from Old System

The old scripts (`ingest_recognitions.py`, `shared.py`) are deprecated but kept for compatibility.

To migrate:
```bash
# Old way
python scripts/ingest/ingest_recognitions.py --limit 100

# New way (better)
python scripts/ingest/cli.py load --limit 100
```

Benefits of new system:
- 3-5x faster (multi-threading)
- Better error handling (retry logic)
- Transaction safety (rollback support)
- Performance metrics (real-time monitoring)
- Cleaner code (modular architecture)

## Support

For issues or questions, check:
1. `python scripts/ingest/cli.py status` - verify connections
2. `python scripts/ingest/cli.py --help` - command reference
3. Review logs for detailed error messages

