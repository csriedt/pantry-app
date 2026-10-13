-- commit_meal now returns { meal_id, version } instead of a bare version.
--
-- Why: the receipt's undo needs the identity of the meal row that was just
-- created. A select-after-insert ("latest own meal") is a race — two
-- devices committing simultaneously can hand one device the other's row
-- id, and undo would flip the wrong meal. Returning the id from the
-- function closes it. Exception to the bare-version convention, taken
-- only because a later intent needs the row's identity.
--
-- Changing the return type forces a DROP first (Postgres refuses
-- CREATE OR REPLACE with a new return type), and the DROP takes the
-- grants with it — so they are re-applied here.
DROP FUNCTION IF EXISTS public.commit_meal(uuid, jsonb, varchar);--> statement-breakpoint
CREATE FUNCTION public.commit_meal(
  p_recipe_id uuid,
  p_booked jsonb,
  p_writer varchar DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booked jsonb := COALESCE(p_booked, '[]'::jsonb);
  v_meal_id uuid;
  v_version bigint;
BEGIN
  INSERT INTO public.meals (user_id, recipe_id, writer, booked)
  VALUES (v_uid, p_recipe_id, p_writer, v_booked)
  RETURNING id INTO v_meal_id;

  -- Apply the booked deductions. Skipped items never reach p_booked, so
  -- "does not try" is the caller's call (commensurability is domain
  -- logic over foods' conversion data); here the amounts are facts. No
  -- clamping: an overshoot is recorded, not hidden.
  UPDATE public.pantry p
  SET
    amount = p.amount - (b ->> 'amount')::numeric,
    updated_at = now()
  FROM jsonb_array_elements(v_booked) b
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

  RETURN jsonb_build_object('meal_id', v_meal_id, 'version', v_version);
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.commit_meal(uuid, jsonb, varchar) IS
  'Write intent: meal commit — insert the meals row (recipe + booked deductions as the ledger), apply the booked amounts to the pantry, bump the doorbell, one transaction. Returns { meal_id, version } so the receipt can undo the exact row. SECURITY INVOKER: RLS gates all writes.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.commit_meal(uuid, jsonb, varchar) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.commit_meal(uuid, jsonb, varchar) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.commit_meal(uuid, jsonb, varchar) FROM PUBLIC;
