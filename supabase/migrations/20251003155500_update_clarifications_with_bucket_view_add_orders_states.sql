BEGIN;

-- Recreate view keeping existing column order; append new columns after bucket
CREATE OR REPLACE VIEW public.clarifications_with_bucket (
  id,
  order_id,
  clarification_id,
  rectangle,
  clarification_type,
  image_found,
  product_name,
  superclass,
  hyperclass,
  ean_matched,
  ean_matched_count,
  available_products,
  metadata,
  image_url_main,
  image_url_qualifying,
  sign,
  primary_ean,
  bucket,
  pos_transaction_id,
  device_canteen_name,
  start_dtts,
  has_assistant_events,
  state,
  state_created_at,
  state_updated_at
) AS
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
  s.updated_at AS state_updated_at
FROM public.clarifications c
JOIN public.orders o ON o.id = c.order_id
LEFT JOIN public.clarification_states s ON s.clarification_id = c.clarification_id
LEFT JOIN public.v_ean_freq_bucket fb ON fb.ean = c.primary_ean;

COMMENT ON VIEW public.clarifications_with_bucket IS 'Clarifications joined with orders, states and frequency bucket for API consumption.';

COMMIT;


