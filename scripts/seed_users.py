#!/usr/bin/env python3
"""
Seed test users for Supabase Auth.
Works for both local and production environments.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import requests
import psycopg2

# Determine environment
project_root = Path(__file__).parent.parent
if len(sys.argv) > 1 and sys.argv[1] == "--production":
    env_path = project_root / ".env.production"
    env_type = "production"
else:
    env_path = project_root / ".env.local"
    env_type = "local"

if not env_path.exists():
    print(f"❌ Error: {env_path} not found")
    sys.exit(1)

load_dotenv(env_path)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

if not all([SUPABASE_URL, SERVICE_ROLE_KEY, DATABASE_URL]):
    print("❌ Error: Missing required environment variables")
    print("   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL")
    sys.exit(1)

# Standard users for all environments
USERS = [
    {"email": "admin@rrs.ru", "password": "admin2024", "role": "admin", "full_name": "Admin User"},
    {"email": "editor@rrs.ru", "password": "editor2024", "role": "editor", "full_name": "Editor User"},
    {"email": "viewer@rrs.ru", "password": "viewer2024", "role": "viewer", "full_name": "Viewer User"},
]

def create_user(email: str, password: str, full_name: str) -> str:
    """Create user via Supabase Auth API."""
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name}
    }
    
    response = requests.post(url, headers=headers, json=data, timeout=10)
    
    if response.status_code == 200:
        user_id = response.json()["id"]
        print(f"✓ Created user: {email}")
        return user_id
    elif "already" in response.text.lower() or "unique" in response.text.lower():
        # User already exists, get ID from database
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("SELECT id FROM auth.users WHERE email = %s", (email,))
        result = cur.fetchone()
        conn.close()
        if result:
            print(f"⊙ User already exists: {email}")
            return result[0]
        else:
            raise Exception(f"User exists but not found: {email}")
    else:
        raise Exception(f"Failed to create {email}: {response.text}")

def update_profile_role(user_id: str, email: str, role: str, full_name: str):
    """Update profile role in database."""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    cur.execute("""
        INSERT INTO public.profiles (id, email, role, full_name)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            role = EXCLUDED.role,
            full_name = EXCLUDED.full_name
    """, (user_id, email, role, full_name))
    
    conn.commit()
    conn.close()
    print(f"  → Role set to '{role}'")

def main():
    print("=" * 60)
    print(f"🌱 Seeding Users ({env_type.upper()})")
    print("=" * 60)
    print(f"Environment: {SUPABASE_URL}")
    print()
    
    success_count = 0
    for user_data in USERS:
        try:
            user_id = create_user(
                user_data["email"],
                user_data["password"],
                user_data["full_name"]
            )
            update_profile_role(
                user_id,
                user_data["email"],
                user_data["role"],
                user_data["full_name"]
            )
            success_count += 1
        except Exception as e:
            print(f"❌ Failed: {user_data['email']} - {e}")
    
    print()
    print("=" * 60)
    print(f"✅ Complete: {success_count}/{len(USERS)} users ready")
    print("=" * 60)
    print()
    print("Credentials:")
    for user_data in USERS:
        print(f"  {user_data['role']:8} → {user_data['email']:20} / {user_data['password']}")
    print()
    
    return 0 if success_count == len(USERS) else 1

if __name__ == "__main__":
    sys.exit(main())

