#!/usr/bin/env python3
"""
Shared utilities for data ingestion scripts
"""
import os
import sys
from pathlib import Path
from datetime import datetime
import psycopg2
from supabase import create_client, Client
from dotenv import load_dotenv


def load_env():
    """Load environment variables from .env.local or .env.production"""
    env_path = Path(__file__).parent.parent.parent / '.env.local'
    if not env_path.exists():
        env_path = Path(__file__).parent.parent.parent / '.env.production'
    
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ Loaded environment from {env_path.name}")
    else:
        print("⚠️  No .env file found, using system environment variables")


def get_supabase_client() -> Client:
    """Get Supabase client"""
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("❌ Missing Supabase credentials:")
        print(f"   NEXT_PUBLIC_SUPABASE_URL: {'✓' if url else '✗'}")
        print(f"   SUPABASE_SERVICE_ROLE_KEY: {'✓' if key else '✗'}")
        sys.exit(1)
    
    return create_client(url, key)


def get_db_connection():
    """Get PostgreSQL database connection"""
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("❌ Missing DATABASE_URL environment variable")
        sys.exit(1)
    
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)


def log(message: str, level: str = "INFO"):
    """Log message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = {
        "INFO": "ℹ️ ",
        "SUCCESS": "✅",
        "WARNING": "⚠️ ",
        "ERROR": "❌",
        "PROGRESS": "📊"
    }.get(level, "")
    
    print(f"[{timestamp}] {prefix} {message}")


def copy_to_table(conn, table_name: str, columns: list, data_rows: list):
    """
    Fast COPY insert into table
    
    Args:
        conn: psycopg2 connection
        table_name: target table name
        columns: list of column names
        data_rows: list of tuples with data
    """
    import io
    import csv
    
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer)
    
    for row in data_rows:
        csv_writer.writerow(row)
    
    csv_buffer.seek(0)
    
    columns_str = ', '.join(columns)
    copy_sql = f"COPY {table_name} ({columns_str}) FROM STDIN WITH (FORMAT CSV)"
    
    with conn.cursor() as cur:
        cur.copy_expert(copy_sql, csv_buffer)
    
    log(f"Inserted {len(data_rows)} rows into {table_name}", "SUCCESS")


def call_transform_function(conn, function_name: str, batch_id: str) -> int:
    """
    Call a transform function and return the number of processed records
    
    Args:
        conn: psycopg2 connection
        function_name: name of the transform function
        batch_id: batch ID to transform
        
    Returns:
        Number of processed records
    """
    with conn.cursor() as cur:
        cur.execute(f"SELECT {function_name}(%s)", (batch_id,))
        result = cur.fetchone()[0]
        return result


def generate_batch_id(prefix: str = "batch") -> str:
    """Generate a batch ID with timestamp"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}"


def validate_env():
    """Validate that all required environment variables are set"""
    required_vars = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "DATABASE_URL"
    ]
    
    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    if missing:
        log("Missing required environment variables:", "ERROR")
        for var in missing:
            print(f"  - {var}")
        sys.exit(1)
    
    log("All required environment variables are set", "SUCCESS")




