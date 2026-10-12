-- cancel_deletion_request() — the schema's ONE SECURITY DEFINER function,
-- and a documented exception to the invoker rule.
--
-- Why definer: the user matrix on deletion_requests is "R/insert own" —
-- cancelling is an UPDATE the user has no grant for, and the 0002 pass
-- deliberately chose a definer RPC over widening the grant. Because definer
-- runs as the owner, RLS is bypassed — so the user_id filter below IS the
-- policy, and it is the only thing standing between a caller and another
-- user's request. Never widen this pattern without an ownership check.
--
-- Idempotent: nothing pending cancels nothing, returns false, no error.
-- No doorbell bump — the deletion lifecycle is not pantry state (the RTBF
-- tombstone on pantry_state is what flips devices, and the purge job owns
-- that).
CREATE OR REPLACE FUNCTION public.cancel_deletion_request()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  UPDATE public.deletion_requests d
  SET status = 'cancelled', cancelled_at = now()
  WHERE d.user_id = v_uid AND d.status = 'pending';

  RETURN FOUND;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.cancel_deletion_request() IS
  'Cancel the caller''s pending deletion request (status = cancelled, cancelled_at = now). The schema''s only SECURITY DEFINER function: definer bypasses RLS, so the internal user_id filter is the ownership policy. Idempotent — returns whether a pending request was cancelled.';
--> statement-breakpoint
GRANT ALL ON FUNCTION public.cancel_deletion_request() TO "service_role";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cancel_deletion_request() TO "authenticated";
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.cancel_deletion_request() FROM PUBLIC;
