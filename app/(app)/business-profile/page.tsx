import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { BusinessProfileForm } from "@/components/screens/business-profile-form";
import { BusinessProfileSubscription } from "@/components/screens/business-profile-subscription";
import { PageHeader } from "@/components/patterns/page-header";

/**
 * Business profile route. Server component to enforce the admin guard
 * server-side; both of the actual section components it renders
 * (`BusinessProfileSubscription`, `BusinessProfileForm`) are client
 * components using the standard service-flow RQ hook pattern.
 *
 * ## Admin-only
 *
 * The sidebar hides this link for non-admins (see `components/app/
 * sidebar.tsx` — `visibleFooterNav`), but that's a UX affordance, not
 * the security boundary. A non-admin could still type the URL, so we
 * enforce here too via Clerk's `has()` primitive — same one
 * `utils/service/requireOrgAdmin.ts` uses server-side for actions.
 * Non-admins get bounced to `/dashboard` (they belong in the app; just
 * not on this page).
 *
 * v1 is org-of-one so every user IS an admin — this check trivially
 * passes today. It's here so the second we introduce member roles
 * (v2+), the guard is already load-bearing.
 */
export default async function BusinessProfilePage() {
  const { has } = await auth();
  if (!has || !has({ role: "org:admin" })) {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-220 px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Business profile"
        subtitle="This is what PreviousApp knows about you — it shapes every campaign, asset and follow-up."
      />
      <BusinessProfileSubscription />
      <BusinessProfileForm />
    </div>
  );
}
