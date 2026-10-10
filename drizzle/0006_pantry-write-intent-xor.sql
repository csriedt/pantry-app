-- Replaces upsert_pantry_item(...) (from 0004) with the correct body.
--
-- Why a replace and not an edit: 0004 is applied to the dev DB, and the
-- stamp never hand-edits an applied migration — a replace is a new ledger
-- entry, and the previous version stays in history.
--
-- The bug 0004 shipped: amount was written as
-- `CASE WHEN p_stock_state IS NULL THEN p_amount END`, so a caller passing
-- BOTH amount and stock_state had its amount silently dropped and the row
-- landed in level mode. Silent interpretation of a bad call is the worst
-- failure shape here — the handoff states the XOR is enforced at the table,
-- so the function must land the arguments as given and let
-- pantry_amount_xor_stock_state reject the both-set call by name.
--
-- Unit still only rides with a counted amount: once stock_state is set, a
-- unit without an amount is meaningless (and amount cannot coexist with
-- stock_state — the check guarantees it), so a level-mode write clears it.
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
  -- The row write. Arguments land as given: the XOR (amount vs stock_state)
  -- and the value set are enforced by the table's pantry_amount_xor_stock_state
  -- and pantry_stock_state_valid checks — a both-set call raises
  -- pantry_amount_xor_stock_state instead of being quietly reinterpreted.
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
  'Write intent: upsert one pantry row (amount/unit in counted mode, stock_state in level mode) and bump the pantry_state doorbell in the same call. SECURITY INVOKER: RLS gates both writes to auth.uid(). Arguments land as given — a both-set call fails pantry_amount_xor_stock_state rather than being reinterpreted. Returns the new state_version.';
