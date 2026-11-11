-- upsert_pantry_item(...) — the write half of the RPC pair (first intent).
--
-- Hand-written (custom) migration: drizzle-kit does not create functions.
-- Contract: schema invariant #1 ("one transaction: state writes +
-- version bump") and the design decisions (keep the atomic write path RPC-shaped:
-- one Postgres function, rows + version bump) —
--   - The function body is the transaction: the row upsert and the doorbell
--     bump land together or not at all.
--   - SECURITY INVOKER: the function runs as the caller, so the insert and
--     update policies on pantry and pantry_state gate it — the row can only
--     ever land for auth.uid(). There is no user argument in the signature.
--   - The doorbell is created on the user's first write (version 1, the
--     DBML default) and incremented thereafter; the same statement covers
--     both. last_mutated_by moves to 'user' with the bump.
--
-- Returns the new version so the client advances its cached copy without a
-- re-read. Later intents stamp the same shape: the checkoff (pantry write +
-- shopping_list_items delete + bump) and the meal-commit.
CREATE OR REPLACE FUNCTION public.upsert_pantry_item(
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
  -- The row write. The XOR (amount vs stock_state) and the value set are
  -- enforced by the table's pantry_amount_xor_stock_state and
  -- pantry_stock_state_valid checks — not duplicated here. Unit only rides
  -- with a counted amount, so a level-mode write clears it.
  INSERT INTO public.pantry (user_id, food_id, amount, unit, stock_state, added_at, updated_at)
  VALUES (
    v_uid,
    p_food_id,
    CASE WHEN p_stock_state IS NULL THEN p_amount END,
    CASE WHEN p_stock_state IS NULL THEN p_unit END,
    p_stock_state,
    now(),
    now()
  )
  ON CONFLICT (user_id, food_id) DO UPDATE
  SET
    amount = CASE WHEN p_stock_state IS NULL THEN p_amount END,
    unit = CASE WHEN p_stock_state IS NULL THEN p_unit END,
    stock_state = p_stock_state,
    updated_at = now();

  -- The doorbell. 1 on create (the DBML default), +1 on conflict — one
  -- statement for both paths. Any failure above aborts this call, so the
  -- bump can never outlive the write it belongs to.
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
COMMENT ON FUNCTION public.upsert_pantry_item(uuid, numeric, varchar, varchar) IS
  'Write intent: upsert one pantry row (amount/unit in counted mode, stock_state in level mode) and bump the pantry_state doorbell in the same call. SECURITY INVOKER: RLS gates both writes to auth.uid(). Returns the new state_version.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.upsert_pantry_item(uuid, numeric, varchar, varchar) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.upsert_pantry_item(uuid, numeric, varchar, varchar) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.upsert_pantry_item(uuid, numeric, varchar, varchar) FROM PUBLIC;
