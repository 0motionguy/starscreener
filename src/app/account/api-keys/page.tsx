// /account/api-keys — per-user API credentials. Hero + Clerk gate come from
// the parent account layout (loadAccountContext).

import { loadAccountContext } from "@/lib/account/load";
import { AccountApiKeys } from "@/components/account/AccountApiKeys";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "API keys",
  description: "Manage your TrendingRepo API credentials.",
  robots: { index: false, follow: false },
};

export default async function AccountApiKeysPage() {
  // Gate only — the keys list is seeded inside the component until the
  // per-user key store lands (matches the prior /account?tab=api-keys behaviour).
  await loadAccountContext();

  return (
    <div className="col gap-4">
      <AccountApiKeys keys={[]} />
    </div>
  );
}
