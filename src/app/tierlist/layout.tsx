// /tierlist + /tierlist/[shortId] — share-URL layout.
// Thin pass-through wrapper. Styles live in /public/shell.css under
// the tier-list-builder primitives block (no per-route CSS files).

import type { ReactNode } from "react";

export default function TierlistLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
