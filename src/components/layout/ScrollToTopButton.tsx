"use client";

import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 1000;

// AGN-643 [QW-6]: floating control to jump back to top after deep scroll.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-20 right-4 z-50 rounded-full border px-3 py-2 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 md:bottom-6 md:right-6"
      style={{
        background: "var(--color-bg-card)",
        borderColor: "var(--color-border-primary)",
        color: "var(--color-text-primary)",
      }}
    >
      Top
    </button>
  );
}
