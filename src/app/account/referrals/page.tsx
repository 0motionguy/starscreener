// /account/referrals — referral link + metrics. Hero + Clerk gate come from
// the parent account layout (loadAccountContext).

import { loadAccountContext } from "@/lib/account/load";
import { getReferralStats } from "@/lib/referrals";
import { deriveCode } from "@/lib/referrals/code";
import { AccountReferralsCard } from "@/components/account/AccountReferralsCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Referrals",
  description: "Your TrendingRepo referral link and credit balance.",
  robots: { index: false, follow: false },
};

export default async function AccountReferralsPage() {
  const ctx = await loadAccountContext();
  const referralCode = deriveCode(ctx.handle, ctx.profileId);
  const referralUrl = `https://trendingrepo.com/r/${referralCode}`;
  const stats = await getReferralStats(ctx.profileId);

  return (
    <div className="col gap-4">
      <AccountReferralsCard
        referralUrl={referralUrl}
        invites={stats.invites}
        paidConversions={stats.paidConversions}
        creditBalance={stats.creditBalance}
      />
    </div>
  );
}
