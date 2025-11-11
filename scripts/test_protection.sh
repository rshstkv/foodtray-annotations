#!/bin/bash

# Тестирует защиту production от db:reset

echo "=========================================="
echo "Testing Production Protection"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Test 1: Проверка wrapper скрипта с production URL
echo "Test 1: Wrapper script with production URL"
echo "------------------------------------------"

# Временно устанавливаем production-like URL
export SUPABASE_URL="https://xxxproduction.supabase.co"
export NEXT_PUBLIC_SUPABASE_URL="https://xxxproduction.supabase.co"

echo "Setting production-like URL: $SUPABASE_URL"

# Запускаем wrapper (должен заблокировать)
"$SCRIPT_DIR/db_reset_wrapper.sh" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "✅ TEST PASSED: Production reset was BLOCKED (exit code: $EXIT_CODE)"
else
    echo "❌ TEST FAILED: Production reset was NOT blocked!"
    exit 1
fi

echo ""

# Test 2: Проверка seed_local.py с production URL
echo "Test 2: seed_local.py with production URL"
echo "------------------------------------------"

OUTPUT=$(python3 "$SCRIPT_DIR/seed_local.py" --force --count 1 2>&1)
echo "$OUTPUT" | head -20

if echo "$OUTPUT" | grep -q "ERROR.*LOCAL database"; then
    echo "✅ TEST PASSED: seed_local.py blocked production"
else
    echo "❌ TEST FAILED: seed_local.py did NOT block production!"
    echo "Full output: $OUTPUT"
    exit 1
fi

echo ""

# Test 3: Проверка quick_restore.py с production URL
echo "Test 3: quick_restore.py with production URL"
echo "------------------------------------------"

OUTPUT=$(python3 "$SCRIPT_DIR/quick_restore.py" --force --count 1 2>&1)
echo "$OUTPUT" | head -20

if echo "$OUTPUT" | grep -q "ERROR.*LOCAL database"; then
    echo "✅ TEST PASSED: quick_restore.py blocked production"
else
    echo "❌ TEST FAILED: quick_restore.py did NOT block production!"
    echo "Full output: $OUTPUT"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ ALL PROTECTION TESTS PASSED!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Wrapper script blocks production"
echo "  ✅ seed_local.py blocks production"
echo "  ✅ quick_restore.py blocks production"
echo ""
echo "Production database is SAFE from accidental reset!"
echo ""

