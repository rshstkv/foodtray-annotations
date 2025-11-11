#!/bin/bash

# DB Reset Wrapper - Защита от случайного удаления production базы данных
# Использование: ./scripts/db_reset_wrapper.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$SCRIPT_DIR/db_config.json"
LOG_FILE="$SCRIPT_DIR/db_reset.log"

# Цвета для вывода
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для логирования
log_action() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local message="$1"
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

# Функция для определения окружения
detect_environment() {
    # Загружаем переменные окружения
    if [ -f "$PROJECT_DIR/.env.local" ]; then
        export $(cat "$PROJECT_DIR/.env.local" | grep -v '^#' | xargs)
    fi
    
    # Проверяем SUPABASE_URL
    local url="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
    
    if [ -z "$url" ]; then
        echo "local"
        return
    fi
    
    # Если URL содержит localhost или 127.0.0.1 - это local
    if [[ "$url" == *"localhost"* ]] || [[ "$url" == *"127.0.0.1"* ]] || [[ "$url" == *"54321"* ]]; then
        echo "local"
    else
        echo "production"
    fi
}

# Функция для чтения конфигурации
read_config() {
    local env=$1
    local key=$2
    
    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${RED}❌ Config file not found: $CONFIG_FILE${NC}"
        exit 1
    fi
    
    # Используем python для чтения JSON (более надежно чем jq)
    python3 -c "import json; config = json.load(open('$CONFIG_FILE')); print(config['$env']['$key'])" 2>/dev/null || echo ""
}

# Главная логика
main() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}        DB RESET PROTECTION WRAPPER${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Определяем окружение
    ENV=$(detect_environment)
    echo -e "${BLUE}🔍 Detected environment: ${YELLOW}$ENV${NC}"
    log_action "DB reset attempt detected. Environment: $ENV"
    
    # Читаем конфигурацию
    ALLOW_RESET=$(read_config "$ENV" "allow_reset")
    REQUIRE_CONFIRMATION=$(read_config "$ENV" "require_confirmation")
    WARNING_MESSAGE=$(read_config "$ENV" "warning_message")
    
    # Проверяем, разрешен ли reset для этого окружения
    if [ "$ALLOW_RESET" = "False" ] || [ "$ALLOW_RESET" = "false" ]; then
        echo ""
        echo -e "${RED}$WARNING_MESSAGE${NC}"
        echo ""
        log_action "DB reset BLOCKED for $ENV environment"
        exit 1
    fi
    
    # Показываем предупреждение
    if [ "$REQUIRE_CONFIRMATION" = "True" ] || [ "$REQUIRE_CONFIRMATION" = "true" ]; then
        echo ""
        echo -e "${YELLOW}$WARNING_MESSAGE${NC}"
        echo ""
        echo -e "${YELLOW}Current environment:${NC} $ENV"
        echo -e "${YELLOW}This action will:${NC}"
        echo -e "  • Drop all tables and data"
        echo -e "  • Re-run all migrations"
        echo -e "  • Run seed scripts (if configured)"
        echo -e "  • You will need to re-import data using seed scripts"
        echo ""
        
        # Запрашиваем подтверждение
        read -p "$(echo -e ${YELLOW}Type \"yes\" to confirm db reset: ${NC})" confirmation
        
        if [ "$confirmation" != "yes" ]; then
            echo -e "${GREEN}✅ DB reset cancelled. No changes made.${NC}"
            log_action "DB reset cancelled by user"
            exit 0
        fi
    fi
    
    # Выполняем reset
    echo ""
    echo -e "${YELLOW}🔄 Running supabase db reset...${NC}"
    log_action "DB reset ALLOWED and EXECUTED for $ENV environment"
    
    cd "$PROJECT_DIR"
    supabase db reset
    
    echo ""
    echo -e "${GREEN}✅ Database reset completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Run seed scripts to restore data:"
    echo -e "     ${GREEN}npm run db:restore:quick${NC}  (for 100 recognitions)"
    echo -e "     ${GREEN}npm run db:restore:full${NC}   (for 1000 recognitions)"
    echo -e "  2. Or manually run:"
    echo -e "     ${GREEN}python3 scripts/quick_restore.py --count 1000${NC}"
    echo ""
    
    log_action "DB reset completed successfully for $ENV environment"
}

# Запуск
main "$@"


