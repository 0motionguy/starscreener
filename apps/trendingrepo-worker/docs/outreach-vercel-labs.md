# Outreach: Vercel Labs (skills.sh public JSON endpoint)

**Status**: DRAFT - operator review before sending.

**Send to**: open@vercel.com / labs@vercel.com (whichever is monitored)
**Subject**: trendingrepo.com indexing skills.sh - small ask + offer

---

Hi Vercel Labs team,

Mirko here from trendingrepo.com (an agent-skill / MCP / model leaderboard
we're building). Big fan of what you've shipped with skills.sh - install
telemetry as a ranking signal is the cleanest thing in the agent-skill
space right now.

We're indexing skills.sh on a 2-hour cadence so authors get cross-source
visibility (their skills surface alongside HF models and GitHub repos in
the same trending view). Today we scrape the public leaderboard with
Firecrawl + JS render. It works, but every UI change breaks our parser
for a few hours.

Would you consider exposing a small JSON endpoint alongside the HTML
view? Something shaped like:

```
GET https://skills.sh/api/leaderboard?view=trending&limit=200
-> { skills: [{ rank, owner, repo, name, installs, agents[] }] }
```

We'd link/credit prominently, and we're happy to contribute a PR if
that helps - we already have the schema mapped from the HTML.

If a public endpoint isn't in the cards, no worries; we'll keep scraping
politely. Just figured asking was cheaper than guessing.

Thanks for skills.sh either way,

Mirko Basil Doelger
trendingrepo.com / ICM Motion
mirko.basil@googlemail.com
github.com/0motionguy

---

## Notes for the operator (cut before sending)

- Sent: NOT YET
- Tone is intentionally short, specific (not vague "love your work" filler), and offers value (PR contribution) instead of just asking.
- If reply is "no", we keep scraping. No follow-up needed.
- If reply is "yes / show us a PR", the worker swap is local: replace `client.ts` with a thin REST client, parser unchanged.
