-- get_pantry_snapshot() — the read half of the RPC pair.
--
-- Hand-written (custom) migration: drizzle-kit does not create functions.
-- Contract: the schema and design decisions (the technical
-- notes) —
--   - SECURITY INVOKER: the function runs as the calling user, so the own-row
--     RLS policies gate it. auth.uid() resolves the user from the client's
--     JWT claims; there is no user argument in the signature.
--   - Version and rows come from ONE statement, so the two halves of the
--     envelope can never see different snapshots ("Read the version and the
--     rows in one statement").
--   - This is the data read; the doorbell is not. Realtime on pantry_state
--     is the hint, never the payload.
--
-- Shape: { version, items }
--   version — the caller's pantry_state.state_version. 0 when the caller has
--     no doorbell row yet (stable convention: no row == never written).
--   items   — flat rows, one per held food, projected for display. The RPC
--     deliberately does NOT group by category: grouping is cheap client-side
--     and keeps this thin. category_id rides along as the grouping key so
--     the client needs no second read to group.
--
-- Grants follow the repo rules: EXECUTE to authenticated (RLS still gates), ALL
-- for service_role, and EXECUTE is revoked from PUBLIC — Postgres grants
-- functions to PUBLIC by default, and the project's exposed-tables-OFF
-- posture is "fails closed" for RPCs too.
CREATE OR REPLACE FUNCTION public.get_pantry_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'version', COALESCE(
      (
        SELECT s.state_version
        FROM public.pantry_state s
        WHERE s.user_id = (SELECT auth.uid())
      ),
      0
    ),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'food_id', f.id,
            'canonical_name', f.canonical_name,
            'category_id', f.category_id,
            'amount', p.amount,
            'unit', p.unit,
            'stock_state', p.stock_state,
            'added_at', p.added_at
          )
          ORDER BY f.canonical_name, f.id
        )
        FROM public.pantry p
        JOIN public.foods f ON f.id = p.food_id
        WHERE p.user_id = (SELECT auth.uid())
      ),
      '[]'::jsonb
    )
  )
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.get_pantry_snapshot() IS
  'Read envelope {version, items} for the calling user. SECURITY INVOKER: the own-row RLS policies gate the join, so a caller only ever sees their own rows. One statement: version and rows share a single snapshot. version is 0 when the user has no pantry_state row. Items are flat — category_id is the grouping key.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.get_pantry_snapshot() TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_pantry_snapshot() TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.get_pantry_snapshot() FROM PUBLIC;
