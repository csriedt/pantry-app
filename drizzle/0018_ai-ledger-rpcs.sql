-- reserve_ai_run(p_user_id, p_reserved_cost, p_limit, p_period_start, p_period_end)
-- — the quota gate.
--
-- Why an RPC and not a plain insert: the hold and the quota check must be one
-- statement group. Two concurrent reserves for the same user would both read
-- the same "spent + held" and both pass, so the check and the insert run
-- under a per-user advisory lock.
--
-- p_limit is the allowance for the period [p_period_start, p_period_end), and
-- both the limit and the period come from the caller: the caller owns the
-- policy, this function only applies it. The DB never decides what a period
-- is, so the app can also answer "what have you used" over the same window.
--
-- A NULL period means no window: the cap then covers every settled fact,
-- ever, and never resets. Both bounds must be given, or both be NULL.
--
-- Settled spend counts only inside the period. Open holds count whatever
-- period they were created in: the money is still at risk, and a hold that
-- settles later is charged to the period in which it settled.
--
-- The money arguments are exact decimal strings (picoToUsd output, e.g.
-- '0.000000846000'). The DB does no pico math; the caller settles the
-- estimate and the service converts at the boundary.
CREATE OR REPLACE FUNCTION public.reserve_ai_run(
  p_user_id uuid,
  p_reserved_cost numeric,
  p_limit numeric,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_spent numeric := 0;
  v_held numeric := 0;
  v_id uuid;
BEGIN
  IF p_reserved_cost IS NULL OR p_reserved_cost < 0 THEN
    RAISE EXCEPTION 'reserve_ai_run: p_reserved_cost must be a non-negative number'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'reserve_ai_run: p_limit must be a non-negative number'
      USING ERRCODE = '22023';
  END IF;

  -- Both bounds or neither. A half-given window is a caller bug, and
  -- guessing which half was meant would silently mis-price the quota.
  IF (p_period_start IS NULL) <> (p_period_end IS NULL) THEN
    RAISE EXCEPTION 'reserve_ai_run: p_period_start and p_period_end must both be given or both be NULL'
      USING ERRCODE = '22023';
  END IF;

  IF p_period_start IS NOT NULL AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'reserve_ai_run: p_period_end must not occur before p_period_start'
      USING ERRCODE = '22023';
  END IF;

  -- One reserve at a time per user. The lock is held to the end of this
  -- transaction, so a second concurrent reserve for the same user waits here
  -- and then sees the first hold in v_held.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Settled facts. Rows whose user_id was nulled on purge are the anonymous
  -- bucket and belong to nobody, so they never count against a user.
  IF p_period_start IS NULL THEN
    -- No window: every settled fact counts, and the cap never resets.
    SELECT coalesce(sum(cost), 0) INTO v_spent
    FROM public.ai_events
    WHERE user_id = p_user_id;
  ELSE
    SELECT coalesce(sum(cost), 0) INTO v_spent
    FROM public.ai_events
    WHERE user_id = p_user_id
      AND at >= p_period_start
      AND at < p_period_end;
  END IF;

  -- Open holds count against the quota as well, whatever period they were
  -- created in: the money is still at risk, and a hold that settles later is
  -- charged to the period in which it settled.
  SELECT coalesce(sum(reserved_cost), 0) INTO v_held
  FROM public.ai_reservations
  WHERE user_id = p_user_id
    AND status = 'reserved';

  -- A quota outcome is a policy branch, not an error: NULL means denied, and
  -- the run seam turns it into the DET fallback.
  IF v_spent + v_held + p_reserved_cost > p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_reservations (user_id, reserved_cost, status)
  VALUES (p_user_id, p_reserved_cost, 'reserved')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.reserve_ai_run(uuid, numeric, numeric, timestamptz, timestamptz) IS
  'Quota gate: inserts the reservation if settled spend in the period + open holds + the new hold fits the cap, and returns the reservation id. Returns NULL when the cap is exceeded. A NULL period means no window — the cap covers all spend and never resets. SECURITY INVOKER; service_role only.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.reserve_ai_run(uuid, numeric, numeric, timestamptz, timestamptz) TO "service_role";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.reserve_ai_run(uuid, numeric, numeric, timestamptz, timestamptz) FROM PUBLIC;

--> statement-breakpoint
-- settle_ai_run(p_user_id, p_reservation_id, p_model, p_input_tokens,
-- p_output_tokens, p_cache_tokens, p_cost, p_rates) — the receipt.
--
-- Why an RPC and not a plain insert: closing the hold and writing the event
-- must be one statement group. A settle that wrote the event but failed to
-- close the hold (or the other way round) would leave the ledger disagreeing
-- with itself, and the guarded update is what makes settle exactly-once.
--
-- p_cost is what was actually spent, as an exact decimal string (picoToUsd
-- output, e.g. '0.000000846000') — not the hold's estimate. p_rates is the
-- snapshot the hold was priced against; the function never re-reads
-- ai_models, so the event can never be charged at "latest" rates.
--
-- A settlement above its own hold is allowed: the spend happened, and the
-- ledger records what happened. The hold's reserved_cost and the event's
-- cost can be compared later, through the reservation_id link.
CREATE OR REPLACE FUNCTION public.settle_ai_run(
  p_user_id uuid,
  p_reservation_id uuid,
  p_model varchar,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_tokens int,
  p_cost numeric,
  p_rates jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
BEGIN
  IF p_model IS NULL OR p_model = '' THEN
    RAISE EXCEPTION 'settle_ai_run: p_model must be given'
      USING ERRCODE = '22023';
  END IF;

  IF p_input_tokens IS NULL OR p_input_tokens < 0 THEN
    RAISE EXCEPTION 'settle_ai_run: p_input_tokens must be a non-negative integer'
      USING ERRCODE = '22023';
  END IF;

  IF p_output_tokens IS NULL OR p_output_tokens < 0 THEN
    RAISE EXCEPTION 'settle_ai_run: p_output_tokens must be a non-negative integer'
      USING ERRCODE = '22023';
  END IF;

  IF p_cache_tokens IS NULL OR p_cache_tokens < 0 THEN
    RAISE EXCEPTION 'settle_ai_run: p_cache_tokens must be a non-negative integer'
      USING ERRCODE = '22023';
  END IF;

  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'settle_ai_run: p_cost must be a non-negative amount'
      USING ERRCODE = '22023';
  END IF;

  IF p_rates IS NULL THEN
    RAISE EXCEPTION 'settle_ai_run: p_rates must be the snapshot the hold was priced against'
      USING ERRCODE = '22023';
  END IF;

  -- One settle at a time per user, the same lock the reserve takes.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- The hold must still be open. This is the exactly-once guard: a second
  -- settle, a settle of a released hold, or a settle of another user's hold
  -- updates nothing and raises.
  UPDATE public.ai_reservations
  SET status = 'settled', closed_at = now()
  WHERE id = p_reservation_id
    AND user_id = p_user_id
    AND status = 'reserved'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'settle_ai_run: reservation % is not open for this user', p_reservation_id
      USING ERRCODE = '22023';
  END IF;

  -- The receipt. The event's user is the hold's user, never an argument.
  INSERT INTO public.ai_events (user_id, model, input_tokens, output_tokens, cache_tokens, cost, rates, reservation_id)
  VALUES (v_user_id, p_model, p_input_tokens, p_output_tokens, p_cache_tokens, p_cost, p_rates, p_reservation_id)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.settle_ai_run(uuid, uuid, varchar, int, int, int, numeric, jsonb) IS
  'Settle a hold: closes the reservation and writes the settled event with the cost actually spent and the rates snapshot the hold was priced against. Raises 22023 if the hold is not open for this user. SECURITY INVOKER; service_role only.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.settle_ai_run(uuid, uuid, varchar, int, int, int, numeric, jsonb) TO "service_role";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.settle_ai_run(uuid, uuid, varchar, int, int, int, numeric, jsonb) FROM PUBLIC;

--> statement-breakpoint
-- release_ai_run(p_user_id, p_reservation_id) — the failure path.
--
-- Closes a hold without spending: the run failed, was aborted, or never
-- reached the model. No event is written — a released run spent nothing, and
-- ai_events holds settled facts only.
--
-- Releasing is idempotent: a hold that is already closed, missing, or
-- someone else's returns false rather than raising. The run seam's failure
-- path calls this as its own cleanup, and a cleanup path must not raise.
CREATE OR REPLACE FUNCTION public.release_ai_run(
  p_user_id uuid,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_released uuid;
BEGIN
  -- One release at a time per user, the same lock the other two take.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- The hold must still be open. The guarded update is what keeps a settle
  -- and a release from both landing: whoever gets there first wins, and the
  -- other one sees false.
  UPDATE public.ai_reservations
  SET status = 'released', closed_at = now()
  WHERE id = p_reservation_id
    AND user_id = p_user_id
    AND status = 'reserved'
  RETURNING id INTO v_released;

  RETURN v_released IS NOT NULL;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.release_ai_run(uuid, uuid) IS
 'Releases a hold without spending: closes the reservation and returns true if a hold was open, false if it was already closed, missing, or not the caller''s. No event is written — a released run spent nothing. SECURITY INVOKER; service_role only.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.release_ai_run(uuid, uuid) TO "service_role";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.release_ai_run(uuid, uuid) FROM PUBLIC;