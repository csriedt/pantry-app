-- get_pantry_snapshot_for(p_user_id) — the trusted-callable twin of
-- get_pantry_snapshot(). Same envelope, same one-statement guarantee;
-- the only change is where identity comes from: the argument instead of
-- auth.uid().
--
-- Why it exists: the server cache can't hold a token, so the cached read
-- calls this over the secret key and the user id becomes the cache key.
--
-- Why it stays SECURITY INVOKER (no definer exception to stamp): called
-- with a user token, RLS still applies and the own-row policies gate it,
-- so a token caller asking for someone else's id gets their own rows or
-- none — the RPC is safe under either credential. Called with the secret
-- key the `p_user_id` filter is the only gate, which is what the RLS
-- suite's cross-user test pins.
--
-- The filter repeats `where user_id = p_user_id` rather than delegating
-- to the auth.uid() original: a claim-forging wrapper (set_config
-- request.jwt.claims) would be drier and would let ANY caller of the
-- wrapper become ANY user. Bounded duplication is the cheaper risk.
-- See ADR 0001.
CREATE OR REPLACE FUNCTION public.get_pantry_snapshot_for(p_user_id uuid)
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
        WHERE s.user_id = p_user_id
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
        WHERE p.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'list', jsonb_build_object(
      'derived', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'food_id', f.id,
              'canonical_name', f.canonical_name,
              'amount', p.amount,
              'unit', p.unit,
              'reason', CASE
                WHEN p.stock_state = 'out' OR (p.amount IS NOT NULL AND p.amount = 0) THEN 'out'
                WHEN p.stock_state = 'short' THEN 'low'
                ELSE 'declining'
              END,
              'used_28d', (
                SELECT count(*)
                FROM public.meals m
                WHERE m.user_id = p.user_id
                  AND m.undone_at IS NULL
                  AND m.at >= now() - interval '28 days'
                  AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(m.booked) b
                    WHERE b ->> 'food_id' = f.id::text
                  )
              )
            )
            ORDER BY f.canonical_name, f.id
          )
          FROM public.pantry p
          JOIN public.foods f ON f.id = p.food_id
          WHERE p.user_id = p_user_id
            AND (
              p.stock_state IN ('out', 'short')
              OR p.amount = 0
              OR (
                p.amount IS NOT NULL
                AND (
                  SELECT count(*)
                  FROM public.meals m
                  WHERE m.user_id = p.user_id
                    AND m.undone_at IS NULL
                    AND m.at >= now() - interval '28 days'
                    AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(m.booked) b
                      WHERE b ->> 'food_id' = f.id::text
                    )
                ) > (
                  SELECT count(*)
                  FROM public.meals m
                  WHERE m.user_id = p.user_id
                    AND m.undone_at IS NULL
                    AND m.at >= now() - interval '56 days'
                    AND m.at < now() - interval '28 days'
                    AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(m.booked) b
                      WHERE b ->> 'food_id' = f.id::text
                    )
                )
              )
            )
        ),
        '[]'::jsonb
      ),
      'stored', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'food_id', f.id,
              'canonical_name', f.canonical_name,
              'source', s.source
            )
            ORDER BY f.canonical_name, f.id
          )
          FROM public.shopping_list_items s
          JOIN public.foods f ON f.id = s.food_id
          WHERE s.user_id = p_user_id
        ),
        '[]'::jsonb
      )
    )
  );
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.get_pantry_snapshot_for(uuid) IS
  'Trusted-callable twin of get_pantry_snapshot(): same envelope, identity from the argument instead of auth.uid(). SECURITY INVOKER on purpose — with a user token RLS still gates it; with the secret key the p_user_id filter is the only gate. Used by the cached read (ADR 0001).';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.get_pantry_snapshot_for(uuid) TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_pantry_snapshot_for(uuid) TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.get_pantry_snapshot_for(uuid) FROM PUBLIC;
