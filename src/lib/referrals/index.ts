// Public surface for the referrals reader. Importers should use the barrel
// rather than reaching into individual files so we can reshuffle internals
// without touching call sites.

export {
  getReferralStats,
  EMPTY_REFERRAL_STATS,
  type ReferralStats,
} from "./queries";
