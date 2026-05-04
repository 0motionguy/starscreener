"use client";

// Client wrapper that defers loading the sonner Toaster (~10–15 kB of
// JS+CSS). Toasts only fire post-hydration in response to user actions,
// so SSR-rendering the host element adds no perceived-speed value but
// shipping the chunk on every initial paint does cost bytes. Same pattern
// as MobileDrawerLazy — the root layout is a Server Component and can't
// pass `ssr: false` to next/dynamic directly.

import dynamic from "next/dynamic";

const Toaster = dynamic(
  () => import("sonner").then((m) => ({ default: m.Toaster })),
  { ssr: false },
);

export function ToasterLazy() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      richColors={false}
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            "!bg-[var(--v4-bg-050)] !border !border-[var(--v4-line-200)] !text-[var(--v4-ink-100)] !rounded-[2px] !shadow-[var(--shadow-popover)] !font-sans !text-[13px]",
          title:
            "!text-[var(--v4-ink-000)] !font-medium !tracking-[-0.005em]",
          description: "!text-[var(--v4-ink-300)] !text-[12px]",
          success:
            "!border-l-[3px] !border-l-[var(--v4-money)]",
          error:
            "!border-l-[3px] !border-l-[var(--v4-red)]",
          info:
            "!border-l-[3px] !border-l-[var(--v4-acc)]",
          warning:
            "!border-l-[3px] !border-l-[var(--v4-amber)]",
        },
      }}
    />
  );
}
