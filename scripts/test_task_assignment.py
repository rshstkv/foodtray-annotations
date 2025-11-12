#!/usr/bin/env python3
"""
Автоматические тесты для проверки назначения задач

Тест-кейсы:
1. Создание задач без фильтра (любые recognitions)
2. Создание задач с фильтром по существующим проверкам
3. Проверка защиты от дублирования
4. Проверка обновления статистики
5. Проверка создания задач с разными scope комбинациями
"""

import os
import sys
import requests
import json
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BASE_URL = 'http://localhost:3000'

# Создаем клиент Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def print_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.YELLOW}ℹ {msg}{Colors.END}")

def get_admin_session():
    """Получить сессию админа"""
    # Логинимся как админ
    response = supabase.auth.sign_in_with_password({
        "email": "admin123@test.com",
        "password": "admin123"
    })
    return response.session

def get_recognition_stats():
    """Получить статистику по recognitions напрямую через Supabase"""
    # Получаем все recognitions
    all_recs = supabase.from_('recognitions').select('recognition_id').execute()
    
    # Получаем все завершенные задачи
    completed_tasks = supabase.from_('tasks').select('recognition_id, task_scope').eq('status', 'completed').execute()
    
    # Группируем по выполненным проверкам
    rec_steps_map = {}
    for rec in all_recs.data:
        rec_steps_map[rec['recognition_id']] = set()
    
    for task in completed_tasks.data:
        if task['recognition_id'] in rec_steps_map:
            steps = task['task_scope'].get('steps', [])
            for step in steps:
                rec_steps_map[task['recognition_id']].add(step['id'])
    
    # Группируем по комбинациям
    by_completed_steps = {}
    for rec_id, steps in rec_steps_map.items():
        key = '+'.join(sorted(steps)) if steps else 'none'
        if key not in by_completed_steps:
            by_completed_steps[key] = {'count': 0, 'step_ids': list(steps)}
        by_completed_steps[key]['count'] += 1
    
    return {
        'total_recognitions': len(all_recs.data),
        'by_completed_steps': by_completed_steps
    }

def get_user_by_email(email):
    """Найти пользователя по email"""
    result = supabase.from_('profiles').select('*').eq('email', email).single().execute()
    return result.data

def create_tasks_batch(filter_steps, assign_steps, user_id, limit=5):
    """Создать пакет задач напрямую через Supabase"""
    from datetime import datetime
    
    # Получаем все recognitions
    all_recs_result = supabase.from_('recognitions').select('recognition_id').order('recognition_date', desc=True).execute()
    all_recs = all_recs_result.data
    
    # Получаем все задачи
    all_tasks_result = supabase.from_('tasks').select('recognition_id, task_scope, status').execute()
    all_tasks = all_tasks_result.data
    
    # Строим карту: recognition_id -> выполненные проверки
    rec_completed_steps = {}
    rec_all_steps = {}
    
    for task in all_tasks:
        rec_id = task['recognition_id']
        task_steps = [s['id'] for s in task['task_scope'].get('steps', [])]
        
        # Все проверки
        if rec_id not in rec_all_steps:
            rec_all_steps[rec_id] = set()
        for step_id in task_steps:
            rec_all_steps[rec_id].add(step_id)
        
        # Только выполненные
        if task['status'] == 'completed':
            if rec_id not in rec_completed_steps:
                rec_completed_steps[rec_id] = set()
            for step_id in task_steps:
                rec_completed_steps[rec_id].add(step_id)
    
    # Фильтруем recognitions
    candidates = []
    for rec in all_recs:
        rec_id = rec['recognition_id']
        
        # Фильтр 1: по выполненным проверкам
        if filter_steps:
            completed = rec_completed_steps.get(rec_id, set())
            if not all(step_id in completed for step_id in filter_steps):
                continue
        
        # Фильтр 2: защита от дублирования
        all_steps = rec_all_steps.get(rec_id, set())
        if any(step_id in all_steps for step_id in assign_steps):
            continue
        
        candidates.append(rec_id)
        if len(candidates) >= limit:
            break
    
    # Создаем задачи
    STEP_DEFS = {
        'validate_dishes': {'id': 'validate_dishes', 'name': 'Проверка блюд с чеком', 'type': 'validation', 'required': True, 'allow_drawing': True},
        'validate_plates': {'id': 'validate_plates', 'name': 'Проверка plates', 'type': 'annotation', 'required': False, 'allow_drawing': False},
        'validate_buzzers': {'id': 'validate_buzzers', 'name': 'Проверка buzzers', 'type': 'annotation', 'required': False, 'allow_drawing': True},
        'check_overlaps': {'id': 'check_overlaps', 'name': 'Отметка перекрытий', 'type': 'annotation', 'required': False, 'allow_drawing': False},
        'validate_bottles': {'id': 'validate_bottles', 'name': 'Ориентация бутылок', 'type': 'annotation', 'required': False, 'allow_drawing': True},
        'validate_nonfood': {'id': 'validate_nonfood', 'name': 'Другие предметы', 'type': 'annotation', 'required': False, 'allow_drawing': True}
    }
    
    tasks_to_create = []
    for rec_id in candidates:
        task_scope = {
            'steps': [STEP_DEFS[step_id] for step_id in assign_steps if step_id in STEP_DEFS],
            'allow_menu_edit': False
        }
        tasks_to_create.append({
            'recognition_id': rec_id,
            'assigned_to': user_id,
            'task_scope': task_scope,
            'priority': 2,
            'status': 'pending',
            'progress': {
                'current_step_index': 0,
                'steps': [{'id': step_id, 'status': 'pending'} for step_id in assign_steps]
            }
        })
    
    if tasks_to_create:
        result = supabase.from_('tasks').insert(tasks_to_create).execute()
        return {'success': True, 'created': len(result.data)}
    else:
        return {'success': True, 'created': 0}

def get_tasks_for_user(user_id):
    """Получить задачи пользователя"""
    result = supabase.from_('tasks').select('*').eq('assigned_to', user_id).execute()
    return result.data

def delete_user_tasks(user_id):
    """Удалить все задачи пользователя (для очистки)"""
    supabase.from_('tasks').delete().eq('assigned_to', user_id).execute()
    print_info(f"Удалены все задачи пользователя {user_id}")

def test_1_create_tasks_without_filter():
    """Тест 1: Создание задач без фильтра"""
    print_test("Создание задач без фильтра (любые recognitions)")
    
    # Получаем тестового пользователя
    user = get_user_by_email('annotator@test.com')
    if not user:
        print_error("Пользователь annotator@test.com не найден")
        return False
    
    # Очищаем задачи
    delete_user_tasks(user['id'])
    
    # Получаем статистику ДО
    stats_before = get_recognition_stats()
    print_info(f"Recognitions до: {stats_before['total_recognitions']}")
    
    # Создаем задачи: только "Блюда"
    result = create_tasks_batch(
        filter_steps=[],  # Без фильтра
        assign_steps=['validate_dishes'],
        user_id=user['id'],
        limit=5
    )
    
    if not result.get('success'):
        print_error(f"Ошибка создания задач: {result.get('error')}")
        return False
    
    print_success(f"Создано задач: {result['created']}")
    
    # Проверяем в БД
    tasks = get_tasks_for_user(user['id'])
    if len(tasks) != 5:
        print_error(f"Ожидалось 5 задач, получено {len(tasks)}")
        return False
    
    # Проверяем scope
    for task in tasks:
        steps = task['task_scope']['steps']
        step_ids = [s['id'] for s in steps]
        if 'validate_dishes' not in step_ids:
            print_error(f"Task {task['id']} не содержит validate_dishes")
            return False
    
    print_success("Все задачи содержат validate_dishes")
    return True

def test_2_create_tasks_with_filter():
    """Тест 2: Создание задач с фильтром по существующим проверкам"""
    print_test("Создание задач с фильтром (только те, где уже есть Блюда)")
    
    user = get_user_by_email('annotator@test.com')
    delete_user_tasks(user['id'])
    
    # Сначала создаем задачи с "Блюда"
    result1 = create_tasks_batch(
        filter_steps=[],
        assign_steps=['validate_dishes'],
        user_id=user['id'],
        limit=3
    )
    print_info(f"Создано {result1['created']} задач с Блюдами")
    
    # Завершаем эти задачи
    tasks = get_tasks_for_user(user['id'])
    for task in tasks:
        supabase.from_('tasks').update({'status': 'completed'}).eq('id', task['id']).execute()
    print_info("Задачи помечены как completed")
    
    # Теперь пытаемся создать задачи с фильтром "где есть Блюда" и добавить "Баззеры"
    result2 = create_tasks_batch(
        filter_steps=['validate_dishes'],  # Фильтр: только где есть Блюда
        assign_steps=['validate_buzzers'],
        user_id=user['id'],
        limit=2
    )
    
    if not result2.get('success'):
        print_error(f"Ошибка: {result2.get('error')}")
        return False
    
    print_success(f"Создано {result2['created']} задач с Баззерами")
    
    # Проверяем что созданы новые задачи (не те же самые recognitions)
    all_tasks = get_tasks_for_user(user['id'])
    pending_tasks = [t for t in all_tasks if t['status'] == 'pending']
    
    if len(pending_tasks) != result2['created']:
        print_error(f"Ожидалось {result2['created']} pending задач, получено {len(pending_tasks)}")
        return False
    
    # Проверяем что новые задачи содержат только validate_buzzers
    for task in pending_tasks:
        steps = task['task_scope']['steps']
        step_ids = [s['id'] for s in steps]
        if 'validate_buzzers' not in step_ids:
            print_error(f"Task {task['id']} не содержит validate_buzzers")
            return False
    
    print_success("Фильтр работает корректно")
    return True

def test_3_duplicate_protection():
    """Тест 3: Защита от дублирования"""
    print_test("Защита от дублирования проверок")
    
    user = get_user_by_email('annotator@test.com')
    delete_user_tasks(user['id'])
    
    # Создаем задачи с "Блюда"
    result1 = create_tasks_batch(
        filter_steps=[],
        assign_steps=['validate_dishes'],
        user_id=user['id'],
        limit=3
    )
    print_info(f"Создано {result1['created']} задач с Блюдами")
    
    # Пытаемся создать еще задачи с "Блюда" для тех же recognitions (НЕ удаляя предыдущие)
    result2 = create_tasks_batch(
        filter_steps=[],
        assign_steps=['validate_dishes'],
        user_id=user['id'],
        limit=5
    )
    
    if not result2.get('success'):
        print_error(f"Ошибка: {result2.get('error')}")
        return False
    
    # Должно быть создано 5 задач, но для ДРУГИХ recognitions (не тех 3)
    if result2['created'] != 5:
        print_error(f"Ожидалось 5 новых задач, создано {result2['created']}")
        return False
    
    print_success(f"Защита сработала: создано {result2['created']} задач для других recognitions")
    
    # Проверяем что нет дублей в БД
    tasks = get_tasks_for_user(user['id'])
    recognition_ids = [t['recognition_id'] for t in tasks]
    
    # Должно быть 8 задач (3 + 5) для 8 разных recognitions
    if len(tasks) != 8:
        print_error(f"Ожидалось 8 задач, получено {len(tasks)}")
        return False
    
    # Проверяем что все recognition_id уникальны
    if len(set(recognition_ids)) != len(recognition_ids):
        print_error("Есть дублирующиеся recognition_id")
        return False
    
    print_success("Нет дублирующихся проверок для одного recognition")
    return True

def test_4_multiple_scopes():
    """Тест 4: Создание задач с несколькими scope"""
    print_test("Создание задач с несколькими проверками")
    
    user = get_user_by_email('annotator@test.com')
    delete_user_tasks(user['id'])
    
    # Создаем задачи с несколькими проверками
    result = create_tasks_batch(
        filter_steps=[],
        assign_steps=['validate_dishes', 'validate_plates', 'validate_buzzers'],
        user_id=user['id'],
        limit=3
    )
    
    if not result.get('success'):
        print_error(f"Ошибка: {result.get('error')}")
        return False
    
    print_success(f"Создано {result['created']} задач")
    
    # Проверяем что все задачи содержат все 3 проверки
    tasks = get_tasks_for_user(user['id'])
    for task in tasks:
        steps = task['task_scope']['steps']
        step_ids = [s['id'] for s in steps]
        
        if len(step_ids) != 3:
            print_error(f"Task {task['id']} содержит {len(step_ids)} проверок вместо 3")
            return False
        
        required = ['validate_dishes', 'validate_plates', 'validate_buzzers']
        if not all(s in step_ids for s in required):
            print_error(f"Task {task['id']} не содержит все требуемые проверки")
            return False
    
    print_success("Все задачи содержат все 3 проверки")
    return True

def test_5_statistics_update():
    """Тест 5: Обновление статистики"""
    print_test("Обновление статистики recognitions")
    
    user = get_user_by_email('annotator@test.com')
    delete_user_tasks(user['id'])
    
    # Получаем статистику ДО
    stats_before = get_recognition_stats()
    available_before = stats_before['by_completed_steps'].get('none', {}).get('count', 0)
    print_info(f"Recognitions без проверок ДО: {available_before}")
    
    # Создаем задачи
    result = create_tasks_batch(
        filter_steps=[],
        assign_steps=['validate_dishes'],
        user_id=user['id'],
        limit=5
    )
    print_info(f"Создано {result['created']} задач")
    
    # Завершаем задачи
    tasks = get_tasks_for_user(user['id'])
    for task in tasks:
        supabase.from_('tasks').update({'status': 'completed'}).eq('id', task['id']).execute()
    print_info("Задачи помечены как completed")
    
    # Получаем статистику ПОСЛЕ
    stats_after = get_recognition_stats()
    available_after = stats_after['by_completed_steps'].get('none', {}).get('count', 0)
    with_dishes = stats_after['by_completed_steps'].get('validate_dishes', {}).get('count', 0)
    
    print_info(f"Recognitions без проверок ПОСЛЕ: {available_after}")
    print_info(f"Recognitions с Блюдами ПОСЛЕ: {with_dishes}")
    
    # Проверяем что статистика изменилась
    if available_after >= available_before:
        print_error("Количество recognitions без проверок не уменьшилось")
        return False
    
    if with_dishes < result['created']:
        print_error(f"Recognitions с Блюдами ({with_dishes}) меньше созданных задач ({result['created']})")
        return False
    
    print_success("Статистика обновилась корректно")
    return True

def main():
    print(f"\n{Colors.BLUE}{'='*60}")
    print("АВТОМАТИЧЕСКИЕ ТЕСТЫ НАЗНАЧЕНИЯ ЗАДАЧ")
    print(f"{'='*60}{Colors.END}\n")
    
    tests = [
        test_1_create_tasks_without_filter,
        test_2_create_tasks_with_filter,
        test_3_duplicate_protection,
        test_4_multiple_scopes,
        test_5_statistics_update
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append((test.__name__, result))
        except Exception as e:
            print_error(f"Ошибка выполнения теста: {e}")
            import traceback
            traceback.print_exc()
            results.append((test.__name__, False))
    
    # Итоговый отчет
    print(f"\n{Colors.BLUE}{'='*60}")
    print("ИТОГОВЫЙ ОТЧЕТ")
    print(f"{'='*60}{Colors.END}\n")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = f"{Colors.GREEN}PASSED{Colors.END}" if result else f"{Colors.RED}FAILED{Colors.END}"
        print(f"{name}: {status}")
    
    print(f"\n{Colors.BLUE}Пройдено: {passed}/{total}{Colors.END}")
    
    if passed == total:
        print(f"{Colors.GREEN}✓ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!{Colors.END}\n")
        return 0
    else:
        print(f"{Colors.RED}✗ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ{Colors.END}\n")
        return 1

if __name__ == '__main__':
    sys.exit(main())

