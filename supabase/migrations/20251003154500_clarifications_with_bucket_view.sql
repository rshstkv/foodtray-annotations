BEGIN;

-- View joining clarifications with frequency bucket for filtering in API
CREATE OR REPLACE VIEW public.clarifications_with_bucket AS
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
  fb.bucket
FROM public.clarifications c
LEFT JOIN public.v_ean_freq_bucket fb
  ON fb.ean = c.primary_ean;

COMMENT ON VIEW public.clarifications_with_bucket IS 'Clarifications joined with frequency bucket to enable filtering by bucket from PostgREST.';

COMMIT;


