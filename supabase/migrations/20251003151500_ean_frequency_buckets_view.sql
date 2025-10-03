BEGIN;

-- View: v_ean_freq_bucket
-- Назначает каждому EAN частотный бакет на основе квартилей по количеству
-- Использует уже существующее представление v_ean_selected_counts (ean, cnt)

CREATE OR REPLACE VIEW public.v_ean_freq_bucket AS
WITH ranked AS (
  SELECT
    ean,
    cnt,
    ntile(4) OVER (ORDER BY cnt DESC, ean) AS tile
  FROM public.v_ean_selected_counts
)
SELECT
  ean,
  cnt,
  CASE tile
    WHEN 1 THEN 'очень частые'
    WHEN 2 THEN 'частые'
    WHEN 3 THEN 'средние'
    ELSE 'редкие'
  END AS bucket
FROM ranked;

COMMENT ON VIEW public.v_ean_freq_bucket IS 'Assign frequency buckets to EANs using ntile(4) over counts: 1=most frequent quartile.';
COMMENT ON COLUMN public.v_ean_freq_bucket.bucket IS 'One of: «очень частые», «частые», «средние», «редкие».';

COMMIT;


