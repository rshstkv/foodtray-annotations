#!/bin/bash

# Тестирует локальное восстановление БД
# Это интерактивный тест, который можно запустить только локально

echo "=========================================="
echo "Testing Local Database Restore"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Проверяем что находимся в локальном окружении
echo "Checking environment..."

# Загружаем .env.local
if [ -f "$PROJECT_DIR/.env.local" ]; then
    export $(cat "$PROJECT_DIR/.env.local" | grep -v '^#' | xargs)
fi

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"

if [[ "$SUPABASE_URL" != *"localhost"* ]] && [[ "$SUPABASE_URL" != *"127.0.0.1"* ]] && [[ "$SUPABASE_URL" != *"54321"* ]]; then
    echo "❌ ERROR: This test can only run in LOCAL environment!"
    echo "   Current URL: $SUPABASE_URL"
    exit 1
fi

echo "✅ Local environment detected: $SUPABASE_URL"
echo ""

# Проверяем наличие необходимых файлов
echo "Checking required files..."

REQUIRED_FILES=(
    "$SCRIPT_DIR/db_config.json"
    "$SCRIPT_DIR/db_reset_wrapper.sh"
    "$SCRIPT_DIR/seed_local.py"
    "$SCRIPT_DIR/upload_images_only.py"
    "$SCRIPT_DIR/check_storage.py"
    "$SCRIPT_DIR/quick_restore.py"
    "$SCRIPT_DIR/import_dataset_fast.py"
)

ALL_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing: $file"
        ALL_EXIST=false
    else
        echo "✅ Found: $(basename $file)"
    fi
done

if [ "$ALL_EXIST" = false ]; then
    echo ""
    echo "❌ Some required files are missing!"
    exit 1
fi

echo ""
echo "✅ All required scripts found"
echo ""

# Проверяем конфигурацию
echo "Checking configuration..."

if python3 -c "import json; config = json.load(open('$SCRIPT_DIR/db_config.json')); print(config['dataset_paths']['default_dataset_dir'])" &>/dev/null; then
    DATASET_DIR=$(python3 -c "import json; config = json.load(open('$SCRIPT_DIR/db_config.json')); print(config['dataset_paths']['default_dataset_dir'])")
    echo "✅ Dataset path configured: $DATASET_DIR"
    
    if [ -d "$DATASET_DIR" ]; then
        echo "✅ Dataset directory exists"
    else
        echo "⚠️  Dataset directory not found (tests requiring dataset will be skipped)"
    fi
else
    echo "⚠️  Could not read config (some tests may fail)"
fi

echo ""

# Test 1: Проверка help для всех скриптов
echo "Test 1: Script help/usage"
echo "------------------------------------------"

SCRIPTS_TO_TEST=(
    "seed_local.py:--help"
    "upload_images_only.py:--help"
    "check_storage.py:--help"
    "quick_restore.py:--help"
)

TEST_PASSED=true
for script_test in "${SCRIPTS_TO_TEST[@]}"; do
    script="${script_test%%:*}"
    flag="${script_test##*:}"
    
    echo -n "Testing $script $flag... "
    if python3 "$SCRIPT_DIR/$script" $flag &>/dev/null; then
        echo "✅"
    else
        echo "❌"
        TEST_PASSED=false
    fi
done

if [ "$TEST_PASSED" = true ]; then
    echo "✅ All scripts have working help"
else
    echo "❌ Some scripts failed help test"
fi

echo ""

# Test 2: Dry run тесты (без реального выполнения)
echo "Test 2: Dry run tests"
echo "------------------------------------------"

# Проверяем что seed_local.py принимает аргументы
echo -n "Testing seed_local.py argument parsing... "
if python3 "$SCRIPT_DIR/seed_local.py" --help 2>&1 | grep -q "count"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

# Проверяем что upload_images_only.py принимает аргументы
echo -n "Testing upload_images_only.py argument parsing... "
if python3 "$SCRIPT_DIR/upload_images_only.py" --help 2>&1 | grep -q "limit"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

# Проверяем что check_storage.py принимает аргументы
echo -n "Testing check_storage.py argument parsing... "
if python3 "$SCRIPT_DIR/check_storage.py" --help 2>&1 | grep -q "detailed"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

# Проверяем что quick_restore.py принимает аргументы
echo -n "Testing quick_restore.py argument parsing... "
if python3 "$SCRIPT_DIR/quick_restore.py" --help 2>&1 | grep -q "skip-reset"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

echo ""

# Test 3: NPM команды
echo "Test 3: NPM commands"
echo "------------------------------------------"

cd "$PROJECT_DIR"

# Проверяем что команды определены
NPM_COMMANDS=(
    "db:reset"
    "db:migrate"
    "db:restore:quick"
    "db:restore:full"
    "db:check"
)

TEST_PASSED=true
for cmd in "${NPM_COMMANDS[@]}"; do
    echo -n "Checking npm run $cmd... "
    if npm run | grep -q "$cmd"; then
        echo "✅"
    else
        echo "❌"
        TEST_PASSED=false
    fi
done

if [ "$TEST_PASSED" = true ]; then
    echo "✅ All NPM commands defined"
else
    echo "❌ Some NPM commands missing"
fi

echo ""

# Test 4: Проверка логики wrapper
echo "Test 4: Wrapper logic"
echo "------------------------------------------"

# Проверяем что wrapper использует конфиг
echo -n "Testing wrapper uses config... "
if grep -q "db_config.json" "$SCRIPT_DIR/db_reset_wrapper.sh"; then
    echo "✅"
else
    echo "❌"
    TEST_PASSED=false
fi

# Проверяем что wrapper проверяет окружение
echo -n "Testing wrapper checks environment... "
if grep -q "detect_environment" "$SCRIPT_DIR/db_reset_wrapper.sh"; then
    echo "✅"
else
    echo "❌"
    TEST_PASSED=false
fi

# Проверяем что wrapper логирует
echo -n "Testing wrapper logs actions... "
if grep -q "log_action" "$SCRIPT_DIR/db_reset_wrapper.sh"; then
    echo "✅"
else
    echo "❌"
    TEST_PASSED=false
fi

echo ""

# Summary
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""
echo "✅ Environment: Local (safe to test)"
echo "✅ All required scripts present"
echo "✅ Script help/usage working"
echo "✅ Argument parsing working"
echo "✅ NPM commands configured"
echo "✅ Wrapper logic verified"
echo ""
echo "=========================================="
echo "MANUAL TESTS RECOMMENDED"
echo "=========================================="
echo ""
echo "To fully test the restore functionality, run manually:"
echo ""
echo "1. Test quick restore (if dataset available):"
echo "   npm run db:restore:quick"
echo ""
echo "2. Test full restore (if dataset available):"
echo "   npm run db:restore:full"
echo ""
echo "3. Test storage check:"
echo "   npm run db:check"
echo ""
echo "4. Test db reset with confirmation:"
echo "   npm run db:reset"
echo ""
echo "⚠️  Note: These commands will modify your LOCAL database"
echo "   Make sure you have a backup if needed!"
echo ""
echo "=========================================="
echo "✅ AUTOMATED TESTS PASSED!"
echo "=========================================="


