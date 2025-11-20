#!/bin/bash
# Unified script to load all data to production
# Usage: ./scripts/load_production.sh [LIMIT]

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Default limit: load all available
LIMIT=${1:-}

echo "=========================================="
echo "🚀 Production Data Load"
echo "=========================================="
echo ""
echo "Dataset: /Users/romanshestakov/Downloads/RRS_Dataset 2"
if [ -n "$LIMIT" ]; then
    echo "Limit: $LIMIT recognitions"
else
    echo "Limit: ALL recognitions (no limit)"
fi
echo ""
echo "This will load:"
echo "  ✓ Recognitions (with images to storage)"
echo "  ✓ Recipes"
echo "  ✓ Qwen annotations"
echo "  ✓ Transform to domain model"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo "Loading data..."
echo ""

# Build command
CMD="python3 scripts/ingest/cli.py --production load \
  --source \"/Users/romanshestakov/Downloads/RRS_Dataset 2\" \
  --with-qwen"

if [ -n "$LIMIT" ]; then
    CMD="$CMD --limit $LIMIT"
fi

# Execute
eval $CMD

# Show final status
echo ""
echo "=========================================="
echo "✅ Load Complete!"
echo "=========================================="
echo ""
python3 scripts/ingest/cli.py --production status

echo ""
echo "To load more data:"
echo "  ./scripts/load_production.sh 1000"
echo ""

