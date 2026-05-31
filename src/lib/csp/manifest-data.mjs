// CSP host data — pure JS source of truth.
//
// Imported by:
//   - src/lib/csp/manifest.ts (typed wrapper used by next.config.ts)
//   - scripts/check-csp-completeness.mjs (lint that runs under plain Node)
//
// Adding a new third-party host: edit one of the arrays below. Run
// `npm run lint:csp` to confirm the codebase doesn't have hard-coded
// HTTPS hosts that aren't allow-listed.

export const CSP_HOSTS = {
  defaultSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "https:", "blob:"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://*.clerk.dev",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://clerk.trendingrepo.com",
    "https://challenges.cloudflare.com",
    "https://static.cloudflareinsights.com",
    "https://*.vercel-analytics.com",
  ],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  workerSrc: ["'self'", "blob:"],
  connectSrc: ["'self'", "https:", "wss:", "data:"],
  frameSrc: [
    "'self'",
    "https://*.clerk.dev",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://challenges.cloudflare.com",
  ],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: [
    "'self'",
    "https://*.clerk.dev",
    "https://*.clerk.com",
    "https://*.clerk.accounts.dev",
  ],
};

export const DIRECTIVE_NAMES = {
  defaultSrc: "default-src",
  imgSrc: "img-src",
  scriptSrc: "script-src",
  styleSrc: "style-src",
  fontSrc: "font-src",
  workerSrc: "worker-src",
  connectSrc: "connect-src",
  frameSrc: "frame-src",
  frameAncestors: "frame-ancestors",
  baseUri: "base-uri",
  formAction: "form-action",
};

export function renderCsp() {
  return Object.keys(DIRECTIVE_NAMES)
    .map((key) => `${DIRECTIVE_NAMES[key]} ${CSP_HOSTS[key].join(" ")}`)
    .join("; ");
}

export function allHttpsHosts() {
  const seen = new Set();
  for (const directive of Object.values(CSP_HOSTS)) {
    for (const value of directive) {
      if (value.startsWith("https://")) seen.add(value);
    }
  }
  return [...seen];
}
