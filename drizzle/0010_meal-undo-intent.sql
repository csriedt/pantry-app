-- undo_meal(p_meal_id) — write intent: the compensating event. Sets
-- undone_at (exactly once — a second undo is a no-op that moves nothing and
-- returns the current version) and restores the booked amounts to the
-- pantry, with one doorbell bump for the pair.
CREATE OR REPLACE FUNCTION public.undo_meal(p_meal_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booked jsonb;
  v_version bigint;
BEGIN
  -- The compensating update. The user_id filter is RLS's own-row rule made
  -- explicit in the statement, so a cross-user id matches nothing.
  UPDATE public.meals m
  SET undone_at = now()
  WHERE m.id = p_meal_id
    AND m.user_id = v_uid
    AND m.undone_at IS NULL
  RETURNING m.booked INTO v_booked;

  IF NOT FOUND THEN
    SELECT COALESCE(
      (SELECT s.state_version FROM public.pantry_state s WHERE s.user_id = v_uid),
      0
    ) INTO v_version;
    RETURN v_version;
  END IF;

  -- Restore the booked amounts. A pantry row deleted since the commit
  -- simply doesn't match; the meal row still records what happened.
  UPDATE public.pantry p
  SET
    amount = p.amount + (b ->> 'amount')::numeric,
    updated_at = now()
  FROM jsonb_array_elements(COALESCE(v_booked, '[]'::jsonb)) b
  WHERE p.user_id = v_uid
    AND p.food_id = (b ->> 'food_id')::uuid
    AND p.amount IS NOT NULL
    AND (b ->> 'amount') IS NOT NULL;

  INSERT INTO public.pantry_state (user_id, state_version, last_mutated_by, updated_at)
  VALUES (v_uid, 1, 'user', now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    state_version = public.pantry_state.state_version + 1,
    last_mutated_by = 'user',
    updated_at = now()
  RETURNING state_version INTO v_version;

  RETURN v_version;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.undo_meal(uuid) IS
  'Write intent: meal undo — exactly-once compensating update of undone_at, restore the booked amounts to the pantry, bump the doorbell. A second undo moves nothing. Returns the new state_version. SECURITY INVOKER: RLS gates all writes.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.undo_meal(uuid) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.undo_meal(uuid) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.undo_meal(uuid) FROM PUBLIC;
