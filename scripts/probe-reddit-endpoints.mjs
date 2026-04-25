// Probe every plausible Reddit access path from the runner that's actually
// executing this script. Goal: find ONE endpoint variation that still
// returns real content from GH Actions egress IPs (which www.reddit.com +
// old.reddit.com both block at the edge with HTTP 403).
//
// Pure diagnostic — no writes, no commits. Logs status, byte count, and a
// content sample so we can pick the winner and integrate it back into
// _reddit-shared.mjs.
//
// Run: node scripts/probe-reddit-endpoints.mjs
// Or via GH Actions workflow_dispatch.

const TARGETS = ["MachineLearning", "ChatGPT"]; // 2 subs, twice each → 8 probes per endpoint type
const TIMEOUT_MS = 12_000;

// Real Chrome on macOS — Mozilla string + matching sec-ch-ua headers below.
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const FULL_BROWSER_HEADERS = {
  "User-Agent": CHROME_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua":
    '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
};

// Each probe is { name, urlFor(sub), headers, contentSignal }
// `contentSignal` is a string the response body must contain to count as
// "real content". For Reddit JSON it's `"data": {`, for RSS it's `<item>`.
const PROBES = [
  {
    name: "www-json",
    urlFor: (s) => `https://www.reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "old-json",
    urlFor: (s) => `https://old.reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "no-subdomain-json",
    urlFor: (s) => `https://reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "np-json",
    urlFor: (s) => `https://np.reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "i-mobile-json",
    urlFor: (s) => `https://i.reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "m-mobile-json",
    urlFor: (s) => `https://m.reddit.com/r/${s}/new.json?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "www-rss",
    urlFor: (s) => `https://www.reddit.com/r/${s}/new/.rss?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
    contentSignal: "<item>",
  },
  {
    name: "old-rss",
    urlFor: (s) => `https://old.reddit.com/r/${s}/new/.rss?limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
    contentSignal: "<item>",
  },
  {
    name: "gateway-mobile",
    urlFor: (s) => `https://gateway.reddit.com/desktopapi/v1/subreddits/${s}?include=identity&after=&limit=10`,
    headers: { ...FULL_BROWSER_HEADERS, Accept: "application/json" },
    contentSignal: '"data"',
  },
  {
    name: "android-mobile-api",
    urlFor: (s) => `https://m.reddit.com/r/${s}/new.json?limit=10&raw_json=1`,
    headers: {
      ...FULL_BROWSER_HEADERS,
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
    },
    contentSignal: '"data"',
  },
];

async function fetchWithTimeout(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: ctrl.signal,
    });
    const body = await res.text();
    return { status: res.status, finalUrl: res.url, body };
  } catch (err) {
    return {
      status: 0,
      finalUrl: url,
      body: "",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`runner egress probe — node ${process.version}, ${TARGETS.length} subs`);
  console.log("---");

  const results = [];
  for (const probe of PROBES) {
    const probeRows = [];
    for (const sub of TARGETS) {
      const url = probe.urlFor(sub);
      const r = await fetchWithTimeout(url, probe.headers);
      const matched = r.body.includes(probe.contentSignal);
      const sample = r.body.slice(0, 120).replace(/\s+/g, " ");
      probeRows.push({
        sub,
        url,
        status: r.status,
        bytes: r.body.length,
        matched,
        sample,
        error: r.error,
      });
      // small jitter so we don't burn through the per-IP rate budget
      await new Promise((res) => setTimeout(res, 600));
    }
    const okCount = probeRows.filter((r) => r.matched).length;
    results.push({ probe: probe.name, okCount, total: probeRows.length, rows: probeRows });
    console.log(
      `[${probe.name.padEnd(20)}] ok=${okCount}/${probeRows.length}  ` +
        probeRows
          .map((r) => `${r.sub}:${r.status}/${r.bytes}B${r.matched ? "✓" : "✗"}`)
          .join("  "),
    );
  }

  console.log("---");
  const winners = results.filter((r) => r.okCount === r.total);
  if (winners.length === 0) {
    console.log("NO PROBE RETURNED REAL CONTENT FROM THIS RUNNER. Sample bodies:");
    for (const r of results) {
      const first = r.rows[0];
      console.log(
        `  ${r.probe.padEnd(20)} status=${first.status} bytes=${first.bytes} sample=${first.sample}`,
      );
    }
  } else {
    console.log("WINNERS (returned real content from every sub):");
    for (const w of winners) console.log(`  ${w.probe}`);
  }
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
