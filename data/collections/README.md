# Collection definitions

Curated lists of GitHub repos grouped by AI topic. Used by the
`/collections/[slug]` route to overlay curation onto the live trending +
delta data that ships in `data/trending.json` and `data/deltas.json`.

## Schema

Each `<slug>.yml`:

- `id: <int>` — upstream OSS Insight numeric ID, preserved for
  traceability. Not used for routing; the filename slug is.
- `name: <string>` — human-readable collection name (for page titles and
  breadcrumbs).
- `items: [<owner/repo>]` — GitHub `full_name` list in canonical
  (case-sensitive) form, as supplied by upstream.

## Source & license

Imported from pingcap/ossinsight under the Apache License, Version 2.0.
See [NOTICE.md](./NOTICE.md) for the upstream commit SHA, attribution,
list of imported files, and resync procedure. Full upstream license
text in [LICENSE.upstream](./LICENSE.upstream).

## Operator notes

- Filenames are the source of truth for routing. Renaming a file moves
  the route.
- The upstream numeric `id` inside each YAML is informational only.
- `items` may contain repos not currently in `data/trending.json` — that
  is expected and handled by the `/collections/[slug]` loader, which
  shows curated-but-quiet repos with a "no data" badge rather than
  hiding them.
