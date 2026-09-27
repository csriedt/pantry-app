import {
  provisionMembership,
  provisionUser,
  provisionWorkspace,
  removeMembership,
  resolveUserId,
  softDeleteUser,
  softDeleteWorkspace,
  updateWorkspace,
} from "@/lib/db/provisioning";
import { linkWaitlistEntryToUser } from "@/lib/waitlist/link";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

/**
 * Pull the primary email off a Clerk user webhook payload. Used only to find
 * the matching waitlist entry inside Clerk — never stored on our side.
 */
function primaryEmail(data: {
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}): string | undefined {
  const list = data.email_addresses ?? [];
  const primary =
    list.find(e => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address;
}

/**
 * Clerk webhook endpoint. Keeps the `users` identity table in sync with Clerk.
 *
 * This route is PUBLIC in `middleware.ts` — the request comes from Clerk's servers,
 * not a signed-in user, so there's no session to protect it. `verifyWebhook`
 * checks the Svix signature instead: it proves the payload really came from
 * Clerk and wasn't tampered with. A bad or missing signature => 400, no work done.
 *
 * Idempotent by design. Clerk retries on any non-2xx, so a handler can run more
 * than once for the same event. Every write is an upsert / guarded update, so a
 * replay is a no-op. Return 200 fast; a thrown error becomes a 5xx and Clerk retries.
 *
 * Needs `CLERK_WEBHOOK_SIGNING_SECRET` in the env (from the Clerk dashboard,
 * Webhooks > your endpoint). Locally, Clerk can't reach `localhost` — use a
 * tunnel (e.g. `ngrok`) and point the dashboard endpoint at the public URL.
 */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Webhook verification failed", { status: 400 });
  }

  switch (evt.type) {
    // `user.updated` has nothing to sync yet — the only user column we store is
    // the immutable Clerk id. Treated as an ensure-exists, same as created.
    case "user.created":
    case "user.updated":
      await provisionUser({ clerkUserId: evt.data.id });
      // On first creation, link any waitlist answers this person left before
      // signing up. We read the email from the payload purely to look up their
      // Clerk waitlist entry; it is never persisted to our DB.
      if (evt.type === "user.created") {
        await linkWaitlistEntryToUser({
          clerkUserId: evt.data.id,
          email: primaryEmail(evt.data),
        });
      }
      break;

    // A new Clerk org. Provision its `workspaces` row. Ensure the creator's
    // `users` row exists FIRST, so `org_owner_id` can point at a real surrogate
    // id instead of null.
    case "organization.created":
      if (evt.data.created_by) {
        await provisionUser({ clerkUserId: evt.data.created_by });
      }
      await provisionWorkspace({
        clerkOrgId: evt.data.id,
        name: evt.data.name,
        orgOwnerId: evt.data.created_by
          ? await resolveUserId(evt.data.created_by)
          : null,
      });
      break;

    // The org was renamed (or otherwise changed) in Clerk. Sync the name.
    // `updateWorkspace` upserts, so it also heals the case where this event
    // beats `organization.created`.
    case "organization.updated":
      await updateWorkspace({
        clerkOrgId: evt.data.id,
        name: evt.data.name,
      });
      break;

    // The org was deleted in Clerk. Soft-delete its `workspaces` row — keep the
    // row so tenant data and `org_owner_id` references survive. `id` is optional
    // on delete events; skip if Clerk didn't send it.
    case "organization.deleted":
      if (evt.data.id) {
        await softDeleteWorkspace({
          clerkOrgId: evt.data.id,
          deletedAt: new Date().toISOString(),
        });
      }
      break;

    case "user.deleted":
      // `id` is optional on delete events; skip if Clerk didn't send it.
      if (evt.data.id) {
        await softDeleteUser({
          clerkUserId: evt.data.id,
          deletedAt: new Date().toISOString(),
        });
      }
      break;

    // A user joined an org, or their role changed. Both resolve to the same
    // upsert: heal both parents first — the event can beat `user.created` or
    // `organization.created` — then link them with the current role.
    case "organizationMembership.created":
    case "organizationMembership.updated":
      await provisionUser({
        clerkUserId: evt.data.public_user_data.user_id,
      });
      await provisionWorkspace({
        clerkOrgId: evt.data.organization.id,
        name: evt.data.organization.name,
      });
      await provisionMembership({
        clerkOrgId: evt.data.organization.id,
        clerkUserId: evt.data.public_user_data.user_id,
        role: evt.data.role,
      });
      break;

    // A user left an org (or was removed). Soft-delete the link.
    case "organizationMembership.deleted":
      await removeMembership({
        clerkOrgId: evt.data.organization.id,
        clerkUserId: evt.data.public_user_data.user_id,
        deletedAt: new Date().toISOString(),
      });
      break;
  }

  return new Response("ok", { status: 200 });
}
