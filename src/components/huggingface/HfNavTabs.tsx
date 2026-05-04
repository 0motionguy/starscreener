import Link from "next/link";
import { cn } from "@/lib/utils";

const HF_TABS = [
  { href: "/huggingface/models", label: "Models" },
  { href: "/huggingface/datasets", label: "Datasets" },
  { href: "/huggingface/spaces", label: "Spaces" },
] as const;

export function HfNavTabs({ activeHref }: { activeHref: (typeof HF_TABS)[number]["href"] }) {
  return (
    <nav
      aria-label="Hugging Face sections"
      className="mb-4 flex flex-wrap gap-2 border-b pb-3"
      style={{ borderColor: "var(--v4-line-100)" }}
    >
      {HF_TABS.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors",
              active ? "font-semibold" : "font-medium",
            )}
            style={{
              borderColor: active ? "#FFD21E" : "var(--v4-line-200)",
              color: active ? "#FFD21E" : "var(--v4-ink-300)",
              background: active ? "rgba(255, 210, 30, 0.08)" : "var(--v4-bg-050)",
            }}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
