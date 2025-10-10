BEGIN;

-- Берём только строки, где есть и pos_transaction_id, и clarification_id.
WITH base_raw AS (
  SELECT
    r.id                                 AS raw_id,
    r.data                                AS data
  FROM public.clarifications_data_raw r
  WHERE (r.data ? 'pos_transaction_id') AND (r.data ? 'clarification_id')
  ORDER BY r.id
),
-- Готовим представление полей для orders
orders_src AS (
  SELECT
    raw_id,
    data->>'pos_transaction_id'                  AS pos_transaction_id,
    data->>'device_canteen_name'                 AS device_canteen_name,
    (data->>'start_dtts')::timestamptz           AS start_dtts,
    COALESCE((data->>'has_assistant_events')::boolean, false) AS has_assistant_events
  FROM base_raw
),
-- Вставляем РОВНО по одной строке orders на каждую строку raw (дубли POS допускаются)
ins_orders AS (
  INSERT INTO public.orders (pos_transaction_id, device_canteen_name, start_dtts, has_assistant_events)
  SELECT pos_transaction_id, device_canteen_name, start_dtts, has_assistant_events
  FROM orders_src
  RETURNING id
),
-- Нумеруем вставленные заказы и источники в одном порядке, чтобы связать 1:1
numbered_orders AS (
  SELECT id, row_number() OVER () AS rn
  FROM ins_orders
),
numbered_raw AS (
  SELECT br.*, row_number() OVER () AS rn
  FROM base_raw br
)

-- Вставляем clarifications, связывая каждую строку raw с соответствующим только что вставленным order_id
INSERT INTO public.clarifications (
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
  sign
)
SELECT
  no.id                                           AS order_id,
  rd.data->>'clarification_id'                    AS clarification_id,
  rd.data->>'rectangle'                           AS rectangle,
  rd.data->>'clarification_type'                  AS clarification_type,
  COALESCE((rd.data->>'image_found')::boolean, false) AS image_found,
  rd.data->>'product_name'                        AS product_name,
  rd.data->>'superclass'                          AS superclass,
  rd.data->>'hyperclass'                          AS hyperclass,
  rd.data->'ean_matched'                          AS ean_matched,
  COALESCE(NULLIF(rd.data->>'ean_matched_count','')::int, 0) AS ean_matched_count,
  rd.data->'d'->'details'                         AS available_products,
  jsonb_build_object(
    'is_buzzer',     COALESCE((rd.data->'d'->>'is_buzzer')::boolean, false),
    'buzzer_type',   rd.data->'d'->>'buzzer_type',
    'buzzer_color',  rd.data->'d'->>'buzzer_color',
    'is_auto_chosen',COALESCE((rd.data->'d'->>'is_auto_chosen')::boolean, false)
  )                                               AS metadata,
  rd.data->>'image_url_main'                      AS image_url_main,
  rd.data->>'image_url_qualifying'                AS image_url_qualifying,
  rd.data->>'sign'                                AS sign
FROM numbered_raw rd
JOIN numbered_orders no ON no.rn = rd.rn;

COMMIT;

