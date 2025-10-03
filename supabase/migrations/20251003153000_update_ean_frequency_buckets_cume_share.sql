BEGIN;

-- Обновляем v_ean_freq_bucket: делим по накопленной доле кларификаций (cumulative share),
-- чтобы в каждом бакете было примерно 25% объектов, а не 25% EAN.

CREATE OR REPLACE VIEW public.v_ean_freq_bucket AS
WITH freq AS (
  SELECT
    ean,
    cnt
  FROM public.v_ean_selected_counts
), ranked AS (
  SELECT
    ean,
    cnt,
    SUM(cnt) OVER (ORDER BY cnt DESC, ean) AS running_cnt,
    SUM(cnt) OVER () AS total_cnt
  FROM freq
)
SELECT
  ean,
  cnt,
  CASE
    WHEN (running_cnt::numeric / NULLIF(total_cnt, 0)) <= 0.25 THEN 'очень частые'
    WHEN (running_cnt::numeric / NULLIF(total_cnt, 0)) <= 0.50 THEN 'частые'
    WHEN (running_cnt::numeric / NULLIF(total_cnt, 0)) <= 0.75 THEN 'средние'
    ELSE 'редкие'
  END AS bucket
FROM ranked;

COMMENT ON VIEW public.v_ean_freq_bucket IS 'Frequency buckets by cumulative share of clarifications: ~25% objects per bucket.';
COMMENT ON COLUMN public.v_ean_freq_bucket.bucket IS 'One of: «очень частые», «частые», «средние», «редкие».';

COMMIT;


