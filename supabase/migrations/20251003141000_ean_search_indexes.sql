BEGIN;

-- 1) Добавляем вычисляемую колонку для "выбранного" (первого) EAN
--    Это позволит быстро и точно фильтровать/считать как в UI (чёрная карточка)
ALTER TABLE public.clarifications
  ADD COLUMN IF NOT EXISTS primary_ean TEXT
  GENERATED ALWAYS AS ((ean_matched -> 0 ->> 'external_id')) STORED;

-- 2) Индекс по primary_ean для точного фильтра и пагинации
CREATE INDEX IF NOT EXISTS idx_clarifications_primary_ean
  ON public.clarifications (primary_ean);

-- 3) GIN индекс по ean_matched для поиска EAN в любом месте массива (оператор @>)
CREATE INDEX IF NOT EXISTS idx_clarifications_ean_matched_gin
  ON public.clarifications
  USING GIN (ean_matched jsonb_path_ops);

COMMENT ON COLUMN public.clarifications.primary_ean IS 'First matched EAN (ean_matched[0].external_id), used for UI selected product filtering.';
COMMENT ON INDEX public.idx_clarifications_primary_ean IS 'Speeds up filtering by primary_ean (first/selected EAN)';
COMMENT ON INDEX public.idx_clarifications_ean_matched_gin IS 'Speeds up JSONB containment queries on ean_matched for any-position EAN search';

-- 4) Удобное представление для частот по выбранному (первому) EAN
CREATE OR REPLACE VIEW public.v_ean_selected_counts AS
SELECT
  primary_ean AS ean,
  COUNT(*)::bigint AS cnt
FROM public.clarifications
WHERE COALESCE(primary_ean, '') <> ''
GROUP BY primary_ean
ORDER BY cnt DESC, ean;

COMMENT ON VIEW public.v_ean_selected_counts IS 'Frequency of the first/selected EAN across clarifications';

COMMIT;







