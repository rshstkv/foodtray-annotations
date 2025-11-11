-- Fix admin view policy to avoid recursive RLS issues
-- Remove the problematic policy that does a subquery
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- For admins to view all profiles, we'll use server-side code with proper permissions
-- The "Users can view own profile" policy is sufficient for users to see their own data

-- Add comment
COMMENT ON POLICY "Users can view own profile" ON public.profiles IS 
'Allow users to view their own profile. Admins use server-side APIs with proper auth.';

