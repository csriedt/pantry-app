-- list_meals_for(p_user_id, p_limit) — the trusted-callable twin of the
-- meals read. Returns SETOF meals rather than a jsonb envelope: the rows
-- are already the wire shape, and the generated types carry them, so the
-- mapper's job is narrowing rather than parsing.
--
-- Same safety profile as get_pantry_snapshot_for: SECURITY INVOKER, so a
-- token call is RLS-filtered on top of the WHERE (the empty intersection —
-- pinned by the RLS suite), and under the secret key the user_id filter is
-- the only gate. See ADR 0001.
CREATE OR REPLACE FUNCTION public.list_meals_for(
  p_user_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.meals
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.*
  FROM public.meals m
  WHERE m.user_id = p_user_id
  ORDER BY m.at DESC
  LIMIT p_limit;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.list_meals_for(uuid, integer) IS
  'Trusted-callable twin of the meals read: the caller''s meals, most recent first, capped at p_limit. SECURITY INVOKER — with a user token RLS still gates it; with the secret key the user_id filter is the only gate. Used by the cached read (ADR 0001).';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.list_meals_for(uuid, integer) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_meals_for(uuid, integer) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.list_meals_for(uuid, integer) FROM PUBLIC;
