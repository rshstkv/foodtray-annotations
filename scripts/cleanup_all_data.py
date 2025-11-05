#!/usr/bin/env python3
"""
Скрипт для полной очистки данных из Supabase.
ВНИМАНИЕ: Удаляет все данные из таблиц и storage!
"""

import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv('.env.local')

# Настройки Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_ANON_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")
    sys.exit(1)

# Создаем клиент Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def cleanup_data():
    """Удаляет все данные из таблиц."""
    print("🗑️  Starting data cleanup...")
    
    try:
        # Удаляем аннотации
        print("Deleting annotations...")
        result = supabase.table('annotations').delete().neq('id', 0).execute()
        print(f"✅ Deleted annotations")
        
        # Удаляем изображения
        print("Deleting recognition_images...")
        result = supabase.table('recognition_images').delete().neq('id', 0).execute()
        print(f"✅ Deleted recognition_images")
        
        # Удаляем recognition_images_raw
        print("Deleting recognition_images_raw...")
        result = supabase.table('recognition_images_raw').delete().neq('id', 0).execute()
        print(f"✅ Deleted recognition_images_raw")
        
        # Удаляем recognitions
        print("Deleting recognitions...")
        result = supabase.table('recognitions').delete().neq('recognition_id', 0).execute()
        print(f"✅ Deleted recognitions")
        
        # Очищаем storage bucket
        print("Cleaning storage bucket...")
        try:
            # Получаем список всех файлов
            files = supabase.storage.from_('bbox-images').list()
            if files:
                file_paths = [f['name'] for f in files]
                if file_paths:
                    supabase.storage.from_('bbox-images').remove(file_paths)
                    print(f"✅ Deleted {len(file_paths)} files from storage")
            else:
                print("✅ Storage bucket is empty")
        except Exception as e:
            print(f"⚠️  Error cleaning storage: {e}")
        
        print("✅ Cleanup completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        sys.exit(1)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Cleanup all data from Supabase')
    parser.add_argument('--force', action='store_true', help='Skip confirmation prompt')
    args = parser.parse_args()
    
    if args.force:
        cleanup_data()
    else:
        response = input("⚠️  This will delete ALL data from the database. Are you sure? (yes/no): ")
        if response.lower() == 'yes':
            cleanup_data()
        else:
            print("Cleanup cancelled.")

