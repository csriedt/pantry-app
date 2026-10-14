-- add_shopping_list_item(p_food_id, p_source) — write intent: the explicit
-- shopping-list add, closing the last silent write in the surface (decision
-- C = A).
--
-- Why it's an RPC and not a plain insert: every other write moves the
-- doorbell, and the list now rides inside the snapshot envelope (0012), so
-- a list add is a dashboard change. One doorbell row per user — this bumps
-- the same `pantry_state` row a pantry write does, so a client subscribes
-- to exactly one row's updates regardless of what changed. Two separate
-- signallers would mean two versions for one envelope and two channels to
-- reconcile — wrong now, and worse once households put a pantry entity
-- behind this key.
--
-- The unique violation on (user_id, food_id) still applies: re-adding an
-- item raises 23505 and nothing moves, which is the same "no state change,
-- no version" rule remove_pantry_item follows.
CREATE OR REPLACE FUNCTION public.add_shopping_list_item(
  p_food_id uuid,
  p_source varchar DEFAULT 'manual'
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
  -- user_id comes from the token, not an argument; RLS's with-check gates
  -- the insert to the caller's own row as well.
  INSERT INTO public.shopping_list_items (user_id, food_id, source)
  VALUES (v_uid, p_food_id, p_source);

  -- The same doorbell every other write rings.
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
COMMENT ON FUNCTION public.add_shopping_list_item(uuid, varchar) IS
  'Write intent: store one explicit shopping-list row and bump the pantry_state doorbell in the same call — the list rides inside the snapshot envelope, so a list add is a dashboard change. Re-adding a held food raises 23505 and moves nothing. SECURITY INVOKER: RLS gates the insert. Returns the new state_version.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.add_shopping_list_item(uuid, varchar) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.add_shopping_list_item(uuid, varchar) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.add_shopping_list_item(uuid, varchar) FROM PUBLIC;
