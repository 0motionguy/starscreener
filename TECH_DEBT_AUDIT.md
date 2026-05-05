## Architecture review — Top10Page.tsx refactor plan (no behavior changes)

**Scope reviewed:** `src/components/top10/Top10Page.tsx` (~1741 LOC), `src/lib/top10/types.ts`, `src/lib/top10/builders.ts`
**Lenses applied:** God modules, Seams, Leaky abstractions, Duplicated logic, Concern leakage, Coupling/cohesion

### Findings

1. **God module — one file owns URL state, ranking UI, share generation, and mini-grid navigation**  
   `src/components/top10/Top10Page.tsx:L115-L280`, `src/components/top10/Top10Page.tsx:L438-L1129`, `src/components/top10/Top10Page.tsx:L1136-L1558`, `src/components/top10/Top10Page.tsx:L1564-L1691`  
   `Top10Page.tsx` carries four distinct responsibilities, which makes it a load-bearing file and blocks parallel safe edits.  
   **Suggested change:** Split into four modules and keep `Top10Page.tsx` as composition shell.

2. **Leaky abstraction — Share UI directly owns outbound URL construction and tracking policy**  
   `src/components/top10/Top10Page.tsx:L1151-L1180`, `src/components/top10/Top10Page.tsx:L1705-L1741`  
   UTM tagging, share intent, OG parameterization, and filename policy are embedded in render code.  
   **Suggested change:** Move this to `src/lib/top10/share-model.ts` and pass a typed model to the share UI.

3. **Duplicated logic — window label semantics exist in multiple modules**  
   `src/components/top10/Top10Page.tsx:L1697-L1699`, `src/lib/top10/builders.ts:L227-L229`  
   Label logic is duplicated and can drift across ranking/meta/share strings.  
   **Suggested change:** Centralize in `src/lib/top10/labels.ts`.

4. **Concern leakage — UI file contains query parsing and metric support matrix policy**  
   `src/components/top10/Top10Page.tsx:L89-L113`, `src/components/top10/Top10Page.tsx:L584-L593`  
   These are domain/view rules, not presentation details.  
   **Suggested change:** Move to `src/lib/top10/view-rules.ts`.

### Things that look bad but are actually fine

- `src/components/top10/Top10Page.tsx:L156-L172` — client-side re-rank for repo-derived categories is intentional with the shipped repo slice contract.
- `src/components/top10/Top10Page.tsx:L143-L154` — `router.replace` URL sync avoids back-stack spam while keeping permalink fidelity.
- `src/components/top10/Top10Page.tsx:L1248-L1255` — inline sticky media-query is acceptable until share extraction lands.

### Out of scope (handed off)

- Security: Nothing material in this refactor scope.
- Tests: assign [Carmela](/AGN/agents/carmela) for seam-level regression coverage after extraction.

### Verdict

**REQUEST_CHANGES** — structural findings 1-4 should be addressed via the split before this surface is considered maintainable.

---

## Top10Page 4-module split plan

### Module 1 — `src/lib/top10/view-rules.ts`
- Move query parsing and support-matrix rules from `Top10Page.tsx:L89-L113` and `Top10Page.tsx:L584-L593`.
- Expose `parseTop10Query`, `isMetricSupported`, `coerceSelection`.

### Module 2 — `src/lib/top10/share-model.ts`
- Move share derivation/helpers from `Top10Page.tsx:L1151-L1180` and `Top10Page.tsx:L1701-L1741`.
- Expose `buildTop10ShareModel({ category, window, aspect, theme, now })`.

### Module 3 — `src/components/top10/ranking-surface.tsx`
- Move ranking board subtree from `Top10Page.tsx:L438-L1130`.
- Keep props narrow: bundle + selected filters + callbacks.

### Module 4 — `src/components/top10/share-surface.tsx`
- Move share panel subtree from `Top10Page.tsx:L1136-L1558`.
- Consume `ShareModel` from module 2.

### Sequencing

1. Extract module 1 and wire state/filter usage.
2. Extract module 2 and replace inline share derivation.
3. Extract module 3 with rendering parity.
4. Extract module 4 and reduce `Top10Page.tsx` to shell.
