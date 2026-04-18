# Resend Domain Warming Checklist

**Goal:** get a sending domain reputation-ready so the P0.1 alert-delivery workstream can fire breakout/digest emails on merge day without hitting spam folders.

**Caveat:** I did not WebFetch Resend docs for this file (per the "you already know the canonical shape" instruction). Values marked **TBD** are ones I'm not 100% confident about at the character level — get the exact string from the Resend dashboard when you add the domain. Everything unmarked is stable enough to act on.

---

## (a) Domain choice

Use a dedicated **subdomain** of the primary product domain, not the apex.

- **Recommended:** `alerts.starscreener.app` (or `mail.starscreener.app`) — reserves the apex for web traffic and keeps email reputation isolated so a bad sending incident can't poison your www root.
- **Alternate if the product domain is different:** TBD — replace `starscreener.app` throughout with the actual prod apex.
- **Do not send from:** the bare apex (`starscreener.app`) — a future spam incident hurts your brand domain. Also do not send from `starscreener.up.railway.app` — Railway subdomains are shared and their SPF/DKIM are Railway's, not yours.

Add the domain in the Resend dashboard under Domains → Add Domain → choose region (use US East / Virginia unless you know a compliance reason to pick EU). Resend will generate the DNS records below.

## (b) SPF record

**Type:** TXT · **Host:** `alerts.starscreener.app` (the sending subdomain itself) · **Value:** Resend issues the exact string when you add the domain; it's a wrapper around their SES relay.

Canonical shape (verify exact text in Resend dashboard):
```
v=spf1 include:amazonses.com ~all
```

**Rules:**
- One SPF record per host. If one already exists, **merge** the `include:` values into the existing `v=spf1` line — do not add a second TXT.
- `~all` during warming, then tighten to `-all` after day 14 when you're confident no other senders use this host.
- If you're also sending via Google Workspace from the same subdomain (don't), you'd need `include:_spf.google.com include:amazonses.com`. Keep the subdomain dedicated to Resend.

## (c) DKIM setup

Resend auto-provisions **two CNAME records** per domain verification. Exact CNAME targets are shown in the dashboard after you add the domain — TBD until then.

**Canonical shape** (verify exact hostnames in dashboard):
- `resend._domainkey.alerts.starscreener.app` → `resend._domainkey.<resend-provided-host>`
- Plus one additional selector CNAME for rotation

**Rules:**
- Both CNAMEs must be live before Resend's "Verify" button succeeds. Propagation is 5-60 min depending on registrar.
- Do not CNAME the entire `_domainkey.<domain>` zone — only the specific selector(s) Resend specifies.
- Resend rotates DKIM keys periodically; keeping both records active covers the rotation window.

## (d) DMARC policy — 21-day progression

**Type:** TXT · **Host:** `_dmarc.starscreener.app` (at the **apex**, not the sending subdomain — DMARC is organizational)

### Week 1 (monitor-only, day 0–6)

```
v=DMARC1; p=none; rua=mailto:dmarc@starscreener.app; pct=100; adkim=r; aspf=r
```

- `p=none` means no enforcement — you just collect aggregate reports.
- `rua=mailto:dmarc@starscreener.app` → wire this to a real inbox (or use a free service like dmarcian / Postmark DMARC / URIports).
- Read the first week of reports. Confirm >95% of your traffic passes both SPF and DKIM aligned checks before advancing.

### Week 2 (soft enforcement at 25% sample, day 7–13)

```
v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@starscreener.app; adkim=r; aspf=r
```

- Only if week 1 reports show ≥95% alignment. Otherwise stay on `p=none` another 7 days and fix whoever's failing first.
- At 25% sample, Resend's delivery rate drop (if any) will be contained.

### Week 3+ (full quarantine, day 14+)

```
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@starscreener.app; adkim=s; aspf=s
```

- Move to strict alignment (`s`) once you're confident no subdomain legitimately sends from a different HELO.
- Escalate to `p=reject` only after 30 days of clean `p=quarantine` reports. Don't rush this — a premature `p=reject` costs real email.

## (e) 7-day warming schedule

StarScreener's realistic early volume is low (transactional alerts + daily digests for a handful of users in week 1). At <1k/day, formal warming matters less than it would for marketing blast — but the sequence below gives you a clean reputation signal and catches any misconfiguration before scale.

| Day | Target volume | Recipient mix | Checks |
|----:|---------------|---------------|--------|
| 1   | **10–50**     | Internal team mailboxes only (you, co-founders, dev team). Gmail + Outlook + one Apple Mail. | All opens in-tab (not spam). 0 bounces. DKIM pass visible in headers. |
| 2   | **50–100**    | Expand to trusted-user allowlist (beta subscribers who explicitly opted in). | <1% bounce, <0.1% spam-report, 0 authentication failures. |
| 3   | **250**       | Same allowlist + 50 public registrations if available. Mixed ESPs (Gmail, Outlook, Yahoo, Proton, custom). | Deliverability report in Resend shows >98% delivered. |
| 4   | **500**       | Same as day 3 scaled. | First DMARC aggregate reports arrive → verify ≥95% aligned. |
| 5   | **1,000**     | All opted-in users. | No Yahoo/AOL rate limiting messages. |
| 6   | **2,000**     | Scale up continues. | <0.05% spam rate (Google Postmaster Tools — sign up for this on day 1). |
| 7   | **5,000 cap** | Hold at 5k/day for at least 7 more days before scaling further. | Reputation graph in Google Postmaster shows "High" or "Medium"+. |

**Hard caps during warming:**
- Never exceed **2× the prior day's volume**.
- Never exceed **5,000/day total in the first 14 days** — Resend free tier caps at ~3,000/mo anyway, so natural throttle.
- If a day's bounce rate >2% OR spam-complaint rate >0.3%, **halve the next day's volume and investigate before scaling**.

## Pre-flight checklist (do TODAY, before P0.1 fires)

- [ ] Create Resend account, add team, enable 2FA on all admin accounts.
- [ ] Add domain `alerts.starscreener.app` (or confirmed prod apex) in Resend dashboard.
- [ ] Copy DKIM CNAMEs from dashboard → add to DNS → wait for propagation → click Verify.
- [ ] Add SPF TXT on `alerts.starscreener.app`.
- [ ] Add DMARC TXT on `_dmarc.starscreener.app` with `p=none` (week 1 value).
- [ ] Create `dmarc@starscreener.app` forwarding alias (or dmarcian/URIports free account) for `rua` delivery.
- [ ] Sign up for **Google Postmaster Tools** with the sending domain — this is the single best reputation signal you'll get for free.
- [ ] Generate a production Resend API key, store in Railway env as `RESEND_API_KEY`, mirror in Vercel (if/when Vercel hosts anything that sends).
- [ ] Verify `.env.example` already has `RESEND_API_KEY` (it does — line 48) so P0.1 doesn't need an env schema change.
- [ ] Send 3 test emails from the Resend dashboard to personal Gmail + Outlook + Apple Mail accounts. Confirm: arrives in Inbox (not Promotions / Spam), DKIM pass, SPF pass, DMARC pass in raw headers.

## After the 7-day warming

- Move DMARC to `p=quarantine; pct=100` (week 3 value).
- Tighten SPF from `~all` to `-all` once you're certain no other sender uses the subdomain.
- If daily volume exceeds 5k, upgrade the Resend plan — free tier caps at ~3k/mo.
- Add a **List-Unsubscribe** header to every digest email (RFC 8058 / one-click) — Gmail requires this for senders >5k/day starting 2024-02.
- Add the `Feedback-ID` header per Gmail spec so complaints route correctly.

## What TBD items to check in the Resend dashboard on day 0

1. Exact SPF `include:` value (is it `amazonses.com` or has Resend switched to a different relay?).
2. Exact DKIM selector names (Resend's default is `resend` but they've rotated selector naming before).
3. Whether Resend now auto-suggests a DMARC record via their "Email Authentication Advisor" — if so, use theirs rather than the boilerplate above.
4. Whether they require a verified `MX` record on the sending subdomain (they don't as of my knowledge, but verify).
