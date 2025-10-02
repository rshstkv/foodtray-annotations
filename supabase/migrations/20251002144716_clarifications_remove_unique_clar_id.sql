BEGIN;

-- 1. Drop the existing foreign key constraint
ALTER TABLE clarification_states DROP CONSTRAINT IF EXISTS clarification_states_clarification_id_fkey;

-- 2. Add a new column to store the clarifications.id reference
ALTER TABLE clarification_states ADD COLUMN clarification_db_id BIGINT;

-- 3. Populate the new column with corresponding clarifications.id values
UPDATE clarification_states cs
SET clarification_db_id = c.id
FROM clarifications c
WHERE cs.clarification_id = c.clarification_id;

-- 4. Add foreign key constraint to the new column
ALTER TABLE clarification_states 
ADD CONSTRAINT clarification_states_clarification_db_id_fkey 
FOREIGN KEY (clarification_db_id) REFERENCES clarifications(id) ON DELETE CASCADE;

-- 5. Add index for performance
CREATE INDEX idx_clarification_states_clarification_db_id ON clarification_states(clarification_db_id);

-- 6. Remove UNIQUE constraint from clarification_id column
ALTER TABLE clarifications DROP CONSTRAINT IF EXISTS clarifications_clarification_id_key;

-- 7. Add comments explaining the changes
COMMENT ON COLUMN clarification_states.clarification_db_id IS 'References clarifications.id for proper foreign key relationship';
COMMENT ON COLUMN clarification_states.clarification_id IS 'Original system ID - kept for compatibility, but not used for FK';
COMMENT ON COLUMN clarifications.clarification_id IS 'Original system ID - may have duplicates';

COMMIT;