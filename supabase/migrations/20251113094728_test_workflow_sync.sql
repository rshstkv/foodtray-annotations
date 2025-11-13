-- Test migration to verify GitHub Actions workflow is working correctly after db reset
-- This migration adds a comment to confirm sync between local and remote migrations

-- Add a comment to the profiles table to verify workflow
COMMENT ON TABLE profiles IS 'User profiles with role-based access control';

-- Verify migration applied
SELECT 'Migration test_workflow_sync applied successfully' as status;

