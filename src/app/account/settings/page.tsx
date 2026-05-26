// /account/settings — account preferences + AISO.tools config. Hero + Clerk
// gate come from the parent account layout (loadAccountContext).
// AccountSettingsPanel is itself async (it loads AISO prefs internally).

import { loadAccountContext } from "@/lib/account/load";
import { AccountSettingsPanel } from "@/components/account/AccountSettingsPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings",
  description: "Your TrendingRepo account preferences.",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const ctx = await loadAccountContext();

  return (
    <div className="col gap-4">
      <AccountSettingsPanel
        email={ctx.email}
        emailDigestEnabled={ctx.emailDigestEnabled}
      />
    </div>
  );
}
