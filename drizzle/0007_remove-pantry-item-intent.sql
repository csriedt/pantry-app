-- remove_pantry_item(p_food_id) — write intent: delete one pantry row and
-- bump the doorbell, or do neither. A remove that lands nothing does NOT
-- move the version (the version means *something changed*); it returns the
-- current version either way so the caller's cached copy stays correct.
CREATE OR REPLACE FUNCTION public.remove_pantry_item(p_food_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted uuid;
  v_version bigint;
BEGIN
  -- RLS gates both the delete and the bump to the caller's own rows.
  DELETE FROM public.pantry
  WHERE user_id = v_uid AND food_id = p_food_id
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    SELECT COALESCE(
      (SELECT s.state_version FROM public.pantry_state s WHERE s.user_id = v_uid),
      0
    ) INTO v_version;
    RETURN v_version;
  END IF;

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
COMMENT ON FUNCTION public.remove_pantry_item(uuid) IS
  'Write intent: delete one of the caller''s pantry rows and bump the pantry_state doorbell in the same call. Nothing to delete = no bump; returns the current version instead. SECURITY INVOKER: RLS gates both writes.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.remove_pantry_item(uuid) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_pantry_item(uuid) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.remove_pantry_item(uuid) FROM PUBLIC;
