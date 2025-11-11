-- Add RLS policy for admins to view all profiles
-- Admins need to see all users in admin panel

-- Create policy for admins to SELECT all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
  )
);

-- Add comment
COMMENT ON POLICY "Admins can view all profiles" ON public.profiles IS 
'Allow admin users to view all profiles for user management';

