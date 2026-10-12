-- checkoff_shopping_item(...) — write intent: the checkoff gesture from the
-- shopping list. Writes the pantry row (counted or level mode — the table's
-- XOR still guards the pair), deletes the list row in the same call, and
-- bumps the doorbell once for both. "I have it again" means ground truth
-- changed, so the list row clears rather than being remembered.
CREATE OR REPLACE FUNCTION public.checkoff_shopping_item(
  p_food_id uuid,
  p_amount numeric DEFAULT NULL,
  p_unit varchar DEFAULT NULL,
  p_stock_state varchar DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_version bigint;
BEGIN
  -- Arguments land as given: a both-set call fails
  -- pantry_amount_xor_stock_state by name. Unit only rides with a counted
  -- amount.
  INSERT INTO public.pantry (user_id, food_id, amount, unit, stock_state, added_at, updated_at)
  VALUES (
    v_uid,
    p_food_id,
    p_amount,
    CASE WHEN p_stock_state IS NULL THEN p_unit END,
    p_stock_state,
    now(),
    now()
  )
  ON CONFLICT (user_id, food_id) DO UPDATE
  SET
    amount = p_amount,
    unit = CASE WHEN p_stock_state IS NULL THEN p_unit END,
    stock_state = p_stock_state,
    updated_at = now();

  -- The list row goes, so the list cannot drift from the pantry.
  DELETE FROM public.shopping_list_items
  WHERE user_id = v_uid AND food_id = p_food_id;

  -- One bump covers both writes.
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
COMMENT ON FUNCTION public.checkoff_shopping_item(uuid, numeric, varchar, varchar) IS
  'Write intent: checkoff — write one pantry row, delete its shopping_list_items row, bump the doorbell, all in one call. Returns the new state_version. SECURITY INVOKER: RLS gates all three writes.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.checkoff_shopping_item(uuid, numeric, varchar, varchar) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.checkoff_shopping_item(uuid, numeric, varchar, varchar) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.checkoff_shopping_item(uuid, numeric, varchar, varchar) FROM PUBLIC;
