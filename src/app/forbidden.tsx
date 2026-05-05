import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-6 md:py-24">
      <div
        className="v2-card overflow-hidden"
        style={{ background: "rgba(255, 77, 77, 0.06)", borderColor: "var(--v2-sig-red)" }}
      >
        <div className="v2-term-bar">
          <span aria-hidden className="flex items-center gap-1.5">
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-sig-red)" }} />
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
          </span>
          <span className="flex-1 truncate" style={{ color: "var(--v2-sig-red)" }}>
            {"// ERROR 403 - ACCESS DENIED"}
          </span>
        </div>

        <div className="p-6 md:p-8">
          <p className={cn("v2-mono text-[11px] tracking-wide")} style={{ color: "var(--v2-ink-400)" }}>
            TERMINAL STATUS: FORBIDDEN
          </p>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1.1,
            }}
          >
            You do not have access to this surface.
          </h1>

          <p className="mt-3 leading-relaxed" style={{ fontSize: 14, color: "var(--v2-ink-300)" }}>
            This path may require admin permissions or a valid token. Switch to a public page or retry with the
            correct credentials.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={ROUTES.HOME} className={cn("v2-btn v2-btn-primary inline-flex")}>
              Go to Home
            </Link>
            <Link href={ROUTES.WATCHLIST} className={cn("v2-btn v2-btn-ghost inline-flex")}>
              Open Watchlist
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
