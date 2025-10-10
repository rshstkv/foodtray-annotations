-- Sync sequences to max(id) to avoid duplicate key on inserts
DO $$
BEGIN
  PERFORM setval(
    pg_get_serial_sequence('public.orders','id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM public.orders), 0), 1)
  );

  PERFORM setval(
    pg_get_serial_sequence('public.clarifications','id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM public.clarifications), 0), 1)
  );

  PERFORM setval(
    pg_get_serial_sequence('public.clarification_states','id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM public.clarification_states), 0), 1)
  );
END $$;



