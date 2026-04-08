#!/usr/bin/env python3
"""
CLI for loading food-plate detection datasets into Supabase.
Supports local, staging, and production environments.
"""
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from ingest.config import IngestConfig
from ingest_detection.loader import DetectionLoader


def load_command(args):
    """Load detection dataset from a local folder."""
    config = IngestConfig.from_env(
        use_production=args.production,
        use_staging=getattr(args, 'staging', False)
    )

    if args.production:
        print("=" * 60)
        print("  PRODUCTION MODE")
        print("=" * 60)
        print("This will upload images and insert records to PRODUCTION.")
        print()
        confirm = input("Type 'CONFIRM' to proceed: ")
        if confirm != "CONFIRM":
            print("Cancelled.")
            return 1
        print()

    source = Path(args.source)
    if not source.is_dir():
        print(f"Error: source directory not found: {source}")
        return 1

    bucket_name = args.bucket_name or source.name

    print(f"Environment : {config.environment}")
    print(f"Source       : {source}")
    print(f"Bucket name  : {bucket_name}")
    print(f"Storage bucket: detection-images")
    print()

    loader = DetectionLoader(config)
    loader.load(source_dir=source, bucket_name=bucket_name)
    return 0


def main():
    parser = argparse.ArgumentParser(description="Food-plate detection dataset loader")
    parser.add_argument("--staging", action="store_true", help="Use staging environment")
    parser.add_argument("--production", action="store_true", help="Use production environment")

    subparsers = parser.add_subparsers(dest="command")

    load_parser = subparsers.add_parser("load", help="Load dataset from folder")
    load_parser.add_argument("--source", required=True, help="Path to folder with images and YOLO .txt files")
    load_parser.add_argument("--bucket-name", dest="bucket_name", help="Bucket name (default: folder name)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    if args.command == "load":
        return load_command(args)

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
