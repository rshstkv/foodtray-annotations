-- Seed file for local development
-- Creates test admin user

-- Create test admin user
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'admin@test.com',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Admin User"}',
  NOW(),
  NOW(),
  'authenticated',
  'authenticated'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password;

-- Create identity for email provider
DELETE FROM auth.identities WHERE user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  jsonb_build_object(
    'sub', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 
    'email', 'admin@test.com',
    'email_verified', true,
    'provider', 'email'
  ),
  'email',
  NOW(),
  NOW(),
  NOW()
);

-- Create profile for admin
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  'admin@test.com',
  'Admin User',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;
