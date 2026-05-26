// /account/alerts — alert inbox. Hero + Clerk gate come from the parent
// account layout (loadAccountContext). This page only loads the alert feed.

import { loadAccountContext } from "@/lib/account/load";
import { listAlertsForUser } from "@/lib/alerts";
import { AccountAlertInbox } from "@/components/account/AccountAlertInbox";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alerts",
  description: "Your TrendingRepo alert inbox.",
  robots: { index: false, follow: false },
};

export default async function AccountAlertsPage() {
  const ctx = await loadAccountContext();
  const events = await listAlertsForUser(ctx.profileId);

  return (
    <div className="col gap-4">
      <AccountAlertInbox events={events} />
    </div>
  );
}
