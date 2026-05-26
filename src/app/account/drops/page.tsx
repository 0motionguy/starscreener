// /account/drops — recent repo-submission queue. Hero + Clerk gate come from
// the parent account layout (loadAccountContext).

import { loadAccountContext } from "@/lib/account/load";
import { readRecentDropEvents } from "@/lib/drop-events";
import { AccountDropsQueue } from "@/components/account/AccountDropsQueue";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Drops",
  description: "Your recent TrendingRepo drop submissions.",
  robots: { index: false, follow: false },
};

function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    console.warn("[account/drops] safe() recovered:", err);
    return fallback;
  });
}

export default async function AccountDropsPage() {
  await loadAccountContext();
  const drops = await safe(
    () => readRecentDropEvents(7 * 24 * 60 * 60 * 1000),
    [],
  );

  return (
    <div className="col gap-4">
      <AccountDropsQueue drops={drops} />
    </div>
  );
}
