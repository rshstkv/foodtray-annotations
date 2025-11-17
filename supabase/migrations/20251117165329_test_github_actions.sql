-- Test migration to verify GitHub Actions workflow
-- This migration adds a comment to verify auto-deployment works

COMMENT ON TABLE profiles IS 'User profiles - AUTO-DEPLOYED via GitHub Actions';

