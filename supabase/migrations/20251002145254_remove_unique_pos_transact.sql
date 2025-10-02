-- Migration: Remove UNIQUE constraint from pos_transaction_id
-- Date: 2025-01-02
-- Description: Allow duplicate pos_transaction_id values to import data as-is

BEGIN;

-- Remove UNIQUE constraint from pos_transaction_id
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pos_transaction_id_key;

-- Add comment explaining the change
COMMENT ON COLUMN orders.pos_transaction_id IS 'POS transaction ID - may have duplicates, data imported as-is';

COMMIT;