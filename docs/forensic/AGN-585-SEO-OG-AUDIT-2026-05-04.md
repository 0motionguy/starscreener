# AGN-585 SEO+OG Audit Matrix (2026-05-04)

Source: Playwright run against https://trendingrepo.com at 2026-05-04.

| Route | HTTP | Title<60 | Desc 120-160 | OG core | Twitter core | Canonical route | JSON-LD present |
|---|---:|---:|---:|---:|---:|---:|---:|
| / | 200 | PASS | PASS | PASS | PASS | PASS | PASS |
| /top10 | 200 | PASS | PASS | PASS | PASS | PASS | FAIL |
| /breakouts | 200 | PASS | PASS | PASS | PASS | PASS | FAIL |
| /signals | 200 | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| /twitter | 200 | PASS | FAIL | PASS | PASS | PASS | FAIL |
| /hackernews/trending | 200 | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| /bluesky/trending | 200 | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| /devto | 200 | PASS | PASS | FAIL | FAIL | PASS | FAIL |
| /lobsters | 200 | PASS | FAIL | PASS | PASS | FAIL | FAIL |
| /producthunt | 200 | PASS | FAIL | PASS | PASS | FAIL | FAIL |
| /mcp | 200 | PASS | FAIL | FAIL | PASS | PASS | FAIL |
| /skills | 200 | PASS | FAIL | FAIL | PASS | PASS | FAIL |

## Notable Fails
- /top10: jsonld
- /breakouts: jsonld
- /signals: og, twitter, jsonld
- /twitter: description-length, jsonld
- /hackernews/trending: og, twitter, jsonld
- /bluesky/trending: og, twitter, jsonld
- /devto: og, twitter, jsonld
- /lobsters: description-length, canonical, jsonld
- /producthunt: description-length, canonical, jsonld
- /mcp: description-length, og, jsonld
- /skills: description-length, og, jsonld