CREATE OR REPLACE VIEW clarifications_flat AS
SELECT
  id,

  -- Основные поля верхнего уровня
  data->>'clarification_id'          AS clarification_id,
  data->>'device_canteen_name'       AS device_canteen_name,
  data->>'pos_transaction_id'        AS pos_transaction_id,
  data->>'start_dtts'                AS start_dtts,
  data->>'clarification_type'        AS clarification_type,
  data->>'product_name'              AS product_name,

  data->>'rectangle'                 AS rectangle,
  data->>'sign'                      AS sign,
  data->>'image_url_main'            AS image_url_main,
  data->>'image_url_qualifying'      AS image_url_qualifying,
  data->>'ean_matched_count'         AS ean_matched_count,

  -- Флажки / булевые
  (data->>'has_assistant_events')::boolean AS has_assistant_events,
  (data->>'image_found')::boolean          AS image_found,

  -- Вложенный объект d -- доставать нужные ключи
  data->'d'->>'clarification_type'  AS d_clarification_type,
  data->'d'->>'rectangle'           AS d_rectangle,
  (data->'d'->>'is_buzzer')::boolean AS is_buzzer,

  -- Массив ean_matched как есть
  data->'ean_matched'               AS ean_matched_raw,

  -- Массив d.details как есть
  data->'d'->'details'              AS details_raw

FROM public.clarifications_data_raw;
