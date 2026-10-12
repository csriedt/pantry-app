-- commit_meal(p_recipe_id, p_booked, p_writer) — write intent: the "Made it"
-- path. Writes the meal row (identity = the recipe; the ledger = the
-- deductions actually booked), applies those deductions to the pantry, and
-- bumps the doorbell — one transaction.
--
-- Commensurability is domain logic over the foods' conversion data and
-- lives in the service layer: skipped items never reach p_booked, so the
-- RPC only records facts. No clamping on the subtraction — an overshoot is
-- recorded, not hidden; corrections are minimal by design.
CREATE OR REPLACE FUNCTION public.commit_meal(
  p_recipe_id uuid,
  p_booked jsonb,
  p_writer varchar DEFAULT 'user'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_booked jsonb := COALESCE(p_booked, '[]'::jsonb);
  v_version bigint;
BEGIN
  INSERT INTO public.meals (user_id, recipe_id, writer, booked)
  VALUES (v_uid, p_recipe_id, p_writer, v_booked);

  -- Apply the booked deductions. A booked food with no pantry row (deleted
  -- between compute and commit) simply doesn't match — drift is accepted,
  -- never forced.
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

  RETURN v_version;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.commit_meal(uuid, jsonb, varchar) IS
  'Write intent: meal commit — insert the meals row (recipe + booked deductions as the ledger), apply the booked amounts to the pantry, bump the doorbell, one transaction. Returns the new state_version. SECURITY INVOKER: RLS gates all writes.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.commit_meal(uuid, jsonb, varchar) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.commit_meal(uuid, jsonb, varchar) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.commit_meal(uuid, jsonb, varchar) FROM PUBLIC;
