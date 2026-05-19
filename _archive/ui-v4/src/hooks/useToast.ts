// AGN-610 — `useToast` hook surface for the toast notification system.
//
// Sonner's `toast` is a stable singleton — it doesn't depend on React
// state, so we don't need a Context/Provider to expose it. This hook is
// a thin convenience wrapper around the centralized `toast` helpers in
// `@/lib/toast` so component code can do:
//
//   const toast = useToast();
//   toast.success("Saved");
//
// …matching the conventional shadcn-style hook shape. We deliberately
// return the same singleton on every call (no `useMemo` needed) — the
// object identity is stable across renders because it lives at module
// scope in `@/lib/toast`.

import { toast } from "@/lib/toast";

export function useToast() {
  return toast;
}

// Re-export the singleton so consumers that prefer the imperative form
// (`import { toast } from "@/hooks/useToast"`) can still get it without
// reaching into `@/lib/toast` directly.
export { toast };
