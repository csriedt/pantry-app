-- get_pantry_snapshot() — replaces the 0003 read with the list section
-- added (decision B: the derived shopping list rides inside the pantry
-- envelope, so one read and one version cover the whole dashboard).
--
-- The list follows the design's derivation, computed in the read so it
-- cannot drift from state:
--   derived  — out (remainder 0: level 'out' or amount = 0), low (level
--              'short'), declining (trailing-28d usage above the prior
--              28 days, finite remainder — a counted amount). Precedence
--              out > low > declining. The "low" threshold IS the level
--              mode's 'short': no numeric threshold exists by design.
--              Counted over net meals (undone_at is null) by booked
--              deductions — the ledger, not guesses.
--   stored   — explicit shopping_list_items rows (never derived rows).
--
-- A food can appear in both sections (explicitly added AND derived); the
-- client merges by food_id — that is the "added" badge case, not a
-- duplicate to filter here.
CREATE OR REPLACE FUNCTION public.get_pantry_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH caller AS (SELECT auth.uid() AS uid)
  SELECT jsonb_build_object(
    'version', COALESCE(
      (
        SELECT s.state_version
        FROM public.pantry_state s
        WHERE s.user_id = (SELECT uid FROM caller)
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
        WHERE p.user_id = (SELECT uid FROM caller)
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
          WHERE p.user_id = (SELECT uid FROM caller)
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
          WHERE s.user_id = (SELECT uid FROM caller)
        ),
        '[]'::jsonb
      )
    )
  );
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.get_pantry_snapshot() IS
  'Read envelope {version, items, list} for the calling user. SECURITY INVOKER: the own-row RLS policies gate every table in the read, so a caller only ever sees their own rows. One statement: version, items, and list share a single snapshot. version is 0 when the user has no pantry_state row. Items are flat (category_id is the grouping key); the list section is the derived shopping list (out/low/declining reasons, 28d net meal usage) plus explicit stored rows.';
