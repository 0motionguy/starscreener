#!/usr/bin/env node
import { readFileSync } from "node:fs";

const required = [
  {
    file: "AGENTS.md",
    phrases: [
      "Production is HOSTUP behind Cloudflare, not Vercel.",
      "expect `Server: cloudflare` with no `X-Vercel-*` headers",
    ],
  },
  {
    file: "CLAUDE.md",
    phrases: [
      "HOSTUP Docker tenant + Cloudflare Tunnel is production",
      "Production source freshness is owned by the HOSTUP worker fleet",
    ],
  },
  {
    file: "WHERE-THINGS-RUN.md",
    phrases: [
      "HOSTUP / TOOLBOX VPS",
      "Cloudflare Tunnel -> HOSTUP",
      "Do not reintroduce duplicate GitHub data producers",
    ],
  },
  {
    file: ".github/workflows/cron-warmup.yml",
    phrases: ["name: Warm HOSTUP routes"],
  },
];

const forbidden = [
  {
    file: "AGENTS.md",
    phrases: [
      "Vercel main = production",
      "GitHub Actions cron for scrapers",
      "sister Railway service",
    ],
  },
  {
    file: "CLAUDE.md",
    phrases: [
      "Vercel main = production",
      "GitHub Actions cron for scrapers",
      "Sister Railway service",
      "Every push from a swarm branch creates a Vercel Preview",
    ],
  },
  {
    file: "WHERE-THINGS-RUN.md",
    phrases: [
      "| trendingrepo-web | **Vercel**",
      "| Web | `trendingrepo.com` (Vercel)",
      "| Vercel (web) |",
      "| App-cron (alerts, referrals, dispatch) | **Vercel Cron**",
    ],
  },
  {
    file: ".github/workflows/cron-warmup.yml",
    phrases: ["name: Warm Vercel routes"],
  },
];

const failures = [];

for (const check of required) {
  const text = readFileSync(check.file, "utf8");
  for (const phrase of check.phrases) {
    if (!text.includes(phrase)) {
      failures.push(`${check.file}: missing required production-topology phrase: ${phrase}`);
    }
  }
}

for (const check of forbidden) {
  const text = readFileSync(check.file, "utf8");
  for (const phrase of check.phrases) {
    if (text.includes(phrase)) {
      failures.push(`${check.file}: stale production-topology phrase remains: ${phrase}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[production-topology-docs] FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[production-topology-docs] OK");
