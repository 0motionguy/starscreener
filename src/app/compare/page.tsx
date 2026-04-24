// StarScreener - Compare page.
//
// Thin server shell that renders the canonical-profile grid. The grid
// client fetches `/api/compare?repos=...` (canonical profiles) and paints
// each slot as a column of mini-modules. Query-param back-compat for
// `?repos=a/b,c/d` is preserved via the client's compare store.

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return <CompareProfileGrid />;
}
