const APIFY_APPROVAL_ENV = 'TRENDINGREPO_ENABLE_APIFY';
const APIFY_APPROVAL_VALUE = 'operator-approved';

export function hasApifyOperatorApproval(): boolean {
  return process.env[APIFY_APPROVAL_ENV]?.trim() === APIFY_APPROVAL_VALUE;
}

export function isApifyTokenApproved(token: string | null | undefined): token is string {
  return Boolean(token?.trim()) && hasApifyOperatorApproval();
}

export function describeApifyGate(token: string | null | undefined): string {
  if (!token?.trim()) return 'off (APIFY_API_TOKEN unset)';
  if (!hasApifyOperatorApproval()) {
    return `off (${APIFY_APPROVAL_ENV}=${APIFY_APPROVAL_VALUE} required)`;
  }
  return 'live';
}
