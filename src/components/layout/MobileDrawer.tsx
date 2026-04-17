"use client";

/**
 * MobileDrawer — slide-in sidebar for <md breakpoint.
 *
 * Renders the same <SidebarContent> as the desktop Sidebar so we only
 * maintain one navigation layout. Framer Motion drives the slide + fade,
 * with a `prefers-reduced-motion` bypass that snaps the drawer open/closed.
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
            className="md:hidden fixed inset-y-0 left-0 w-[85vw] max-w-[320px] bg-bg-primary z-[60] border-r border-border-primary flex flex-col"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={transition}
          >
            {data ? (
              <SidebarContent
                categoryStats={data.categoryStats}
                metaCounts={data.metaCounts}
                availableLanguages={data.availableLanguages}
                watchlistPreview={watchlistPreview}
                unreadAlerts={data.unreadAlerts}
                onClose={close}
              />
            ) : (
              <SidebarSkeleton />
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
