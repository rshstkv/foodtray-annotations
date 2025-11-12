#!/usr/bin/env python3
"""
Обновить menu_all (активное меню) для всех recognitions
БЕЗ удаления данных
"""
import os
import sys
import json
from pathlib import Path
from tqdm import tqdm
from supabase import create_client

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 update_menu_all.py <dataset_dir>")
        sys.exit(1)
    
    dataset_dir = Path(sys.argv[1])
    
    # Load .env.local
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key_raw, val = line.strip().split('=', 1)
                    key_clean = key_raw.strip()
                    val_clean = val.strip().strip('"').strip("'")
                    os.environ[key_clean] = val_clean
    
    # Supabase setup
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not all([url, key]):
        print("❌ Missing env vars")
        sys.exit(1)
    
    supabase = create_client(url, key)
    
    print("=" * 60)
    print("🍽️  UPDATE MENU_ALL (Активное меню)")
    print("=" * 60)
    
    # Find export directory
    export_dirs = list(dataset_dir.glob("export_*"))
    if not export_dirs:
        print(f"❌ No export_* directories in {dataset_dir}")
        sys.exit(1)
    
    export_dir = sorted(export_dirs)[-1]
    print(f"📁 Using: {export_dir.name}")
    
    # Get all recognitions from DB
    result = supabase.table('recognitions').select('recognition_id').execute()
    recognition_ids = [r['recognition_id'] for r in result.data]
    
    print(f"📋 Found {len(recognition_ids)} recognitions in DB")
    
    # Update each recognition
    updated = 0
    not_found = 0
    
    for rec_id in tqdm(recognition_ids, desc="Updating"):
        rec_dir = export_dir / rec_id
        
        if not rec_dir.exists():
            not_found += 1
            continue
        
        # Find AM.json (активное меню)
        menu_files = list(rec_dir.glob('*AM.json'))
        if not menu_files:
            not_found += 1
            continue
        
        with open(menu_files[0]) as f:
            menu_all = json.load(f)
        
        # Update in DB
        supabase.table('recognitions').update({
            'menu_all': menu_all
        }).eq('recognition_id', rec_id).execute()
        
        updated += 1
    
    print("\n" + "=" * 60)
    print("✅ UPDATE COMPLETE!")
    print("=" * 60)
    print(f"   Updated: {updated}")
    print(f"   Not found: {not_found}")

if __name__ == "__main__":
    main()

