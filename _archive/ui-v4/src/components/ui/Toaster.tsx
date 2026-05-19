"use client";

// AGN-610 — canonical Toaster surface for the toast notification system.
//
// The actual provider/container lives in `components/feedback/ToasterLazy`
// (it's lazy-loaded in `app/layout.tsx` to keep sonner's ~10–15 kB out of
// the initial paint chunk). This file re-exports the same component under
// the path the design-system spec calls out (`components/ui/Toaster`) so
// future consumers can import from the conventional `ui/` namespace
// without us shipping two Toaster instances.

export { ToasterLazy as Toaster } from "@/components/feedback/ToasterLazy";
