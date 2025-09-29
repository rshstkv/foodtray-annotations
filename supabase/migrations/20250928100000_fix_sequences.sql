-- Sync sequences to max(id) to avoid duplicate key on inserts
DO $$
BEGIN
  PERFORM setval(
    pg_get_serial_sequence('public.orders','id'),
    COALESCE((SELECT MAX(id) FROM public.orders), 0)
  );

  PERFORM setval(
    pg_get_serial_sequence('public.clarifications','id'),
    COALESCE((SELECT MAX(id) FROM public.clarifications), 0)
  );

  PERFORM setval(
    pg_get_serial_sequence('public.clarification_states','id'),
    COALESCE((SELECT MAX(id) FROM public.clarification_states), 0)
  );
END $$;



