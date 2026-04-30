"use client";

/**
 * MobileDrawer — slide-in sidebar for <md breakpoint.
 *
 * Renders the same <SidebarContent> as the desktop Sidebar so we only
 * maintain one navigation layout. Framer Motion drives the slide + fade,
 * with a `prefers-reduced-motion` bypass that snaps the drawer open/closed.
 *
 * V2 chrome:
 *   - Panel: `--v2-bg-050` background, `--v2-line-200` right hairline,
 *     2px corner radius (matches V2 cards).
 *   - Backdrop: black/60 (unchanged) — V2 has no opinion on overlay tint.
 *   - Header strip: terminal-bar `// MENU · MOBILE` (mono uppercase,
 *     `--v2-line-std` bottom border) + ghost close button.
 *   - The inner V1 mobile-only header strip rendered by SidebarContent
 *     (when `onClose` is provided) is suppressed via a scoped arbitrary
 *     selector so we present a single V2 header. We still pass `onClose`
 *     because SidebarContent's nav handlers call it to dismiss the drawer
 *     after a tap — that behavior must remain identical.
 *
 * Lifecycle:
 *   - Escape key or backdrop click closes.
 *   - Body scroll is locked while open.
 *   - Pathname change auto-closes the drawer so navigating from a nav
 *     item dismisses the overlay.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useSidebarStore } from "@/lib/store";
import { SidebarContent } from "./SidebarContent";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { useSidebarData, useWatchlistPreview } from "./Sidebar";

export function MobileDrawer() {
  const open = useSidebarStore((s) => s.mobileOpen);
  const close = useSidebarStore((s) => s.closeMobile);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  const data = useSidebarData();
  const watchlistPreview = useWatchlistPreview(data?.reposById);

  // Escape-to-close + body scroll lock. Effect only runs while the drawer
  // is open so we don't hold the document listener unnecessarily.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  // Auto-close on route change so tapping a nav item dismisses the drawer.
  useEffect(() => {
    if (open) close();
    // Intentionally depend only on pathname — we do NOT want to close the
    // drawer when `close` identity rotates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] as const };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drawer-backdrop"
            className="md:hidden fixed inset-0 bg-black/60 z-[55]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={close}
            aria-hidden="true"
          />
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="v4-panel md:hidden fixed inset-y-0 left-0 w-[85vw] max-w-[320px] z-[60] flex flex-col"
            style={{
              borderRight: "1px solid var(--v4-line-200)",
              borderTopRightRadius: 2,
              borderBottomRightRadius: 2,
            }}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={transition}
          >
            {/* V2 terminal-bar header — three dots, eyebrow label, ghost
                close. Stays outside SidebarContent so we don't have to
                edit that shared component. */}
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-2"
              style={{
                borderBottom: "1px solid var(--v4-line-200)",
                background: "var(--v4-bg-050)",
              }}
            >
              <span aria-hidden className="flex items-center gap-1.5">
                <span
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--v4-acc)" }}
                />
                <span
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--v4-line-200)" }}
                />
                <span
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--v4-line-200)" }}
                />
              </span>
              <span
                className="v2-mono flex-1 truncate"
                style={{
                  fontSize: 11,
                  color: "var(--v4-ink-200)",
                }}
              >
                {"// MENU · MOBILE"}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="v4-button"
                style={{
                  height: 28,
                  width: 28,
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 2,
                }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Body wrapper. Suppress the V1 mobile-only header strip
                that SidebarContent renders when `onClose` is provided —
                we already show our V2 terminal-bar above. The scoped
                style hides only the V1 strip (the first child div of
                SidebarContent's root that is itself `md:hidden`) without
                touching the shared component. */}
            <style>{`
              .v2-mobile-drawer-body > div > div.md\\:hidden:first-child { display: none; }
            `}</style>
            <div className="v2-mobile-drawer-body flex-1 min-h-0 flex flex-col">
              {data ? (
                <SidebarContent
                  categoryStats={data.categoryStats}
                  metaCounts={data.metaCounts}
                  availableLanguages={data.availableLanguages}
                  watchlistPreview={watchlistPreview}
                  unreadAlerts={data.unreadAlerts}
                  sourceCounts={data.sourceCounts}
                  trendingReposCount={data.trendingReposCount}
                  onClose={close}
                />
              ) : (
                <SidebarSkeleton />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
