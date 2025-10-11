-- Fix clarifications_with_bucket view: use correct join by clarification_db_id instead of clarification_id
-- This prevents duplicate rows in the view when multiple clarifications have the same external clarification_id
BEGIN;

DROP VIEW IF EXISTS public.clarifications_with_bucket;

CREATE VIEW public.clarifications_with_bucket AS
SELECT
  c.id,
  c.order_id,
  c.clarification_id,
  c.rectangle,
  c.clarification_type,
  c.image_found,
  c.product_name,
  c.superclass,
  c.hyperclass,
  c.ean_matched,
  c.ean_matched_count,
  c.available_products,
  c.metadata,
  c.image_url_main,
  c.image_url_qualifying,
  c.sign,
  c.primary_ean,
  fb.bucket,
  o.pos_transaction_id,
  o.device_canteen_name,
  o.start_dtts,
  o.has_assistant_events,
  s.state,
  s.created_at AS state_created_at,
  s.updated_at AS state_updated_at,
  -- Correct dish fields
  cd.selected_ean AS correct_dish_ean,
  cd.selected_product_name AS correct_dish_name,
  cd.source AS correct_dish_source,
  -- Computed field: actual correct EAN for ground truth
  CASE
    WHEN s.state = 'yes' THEN c.primary_ean
    WHEN s.state = 'no' AND cd.selected_ean IS NOT NULL THEN cd.selected_ean
    ELSE NULL
  END AS actual_correct_ean
FROM public.clarifications c
JOIN public.orders o ON o.id = c.order_id
LEFT JOIN public.clarification_states s ON s.clarification_db_id = c.id  -- FIXED: was s.clarification_id = c.clarification_id
LEFT JOIN public.v_ean_freq_bucket fb ON fb.ean = c.primary_ean
LEFT JOIN public.correct_dishes cd ON cd.clarification_db_id = c.id;

COMMENT ON VIEW public.clarifications_with_bucket IS 'Clarifications with orders, states, frequency bucket, and correct dishes. States joined by clarification_db_id to ensure 1-to-1 relationship.';
COMMENT ON COLUMN public.clarifications_with_bucket.correct_dish_ean IS 'EAN of manually selected correct dish (when state=no)';
COMMENT ON COLUMN public.clarifications_with_bucket.correct_dish_name IS 'Name of manually selected correct dish (when state=no)';
COMMENT ON COLUMN public.clarifications_with_bucket.correct_dish_source IS 'Source of correct dish selection: available or menu';
COMMENT ON COLUMN public.clarifications_with_bucket.actual_correct_ean IS 'Computed ground truth: primary_ean if state=yes, selected_ean if state=no, else NULL';

COMMIT;

