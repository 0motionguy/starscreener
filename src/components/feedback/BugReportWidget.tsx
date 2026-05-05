"use client";

import { useMemo, useState } from "react";
import { Bug } from "lucide-react";

const ISSUE_BASE = "https://github.com/0motionguy/starscreener/issues/new";

export function BugReportWidget() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");

  const meta = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const lines = [
      "### Environment",
      `- URL: ${window.location.href}`,
      `- User Agent: ${navigator.userAgent}`,
      `- Time: ${new Date().toISOString()}`,
    ];
    return lines.join("\n");
  }, [open]);

  const canSubmit = summary.trim().length >= 4 && details.trim().length >= 8;

  const onSubmit = () => {
    if (!canSubmit) {
      return;
    }

    const title = `[bug] ${summary.trim()}`;
    const bodySections = [
      "### What happened",
      details.trim(),
      contact.trim() ? `### Contact\n${contact.trim()}` : "",
      meta,
    ].filter(Boolean);

    const url = `${ISSUE_BASE}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(
      bodySections.join("\n\n"),
    )}&labels=${encodeURIComponent("bug,triage")}`;

    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Report a bug"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium shadow-lg transition hover:opacity-95 md:bottom-6"
        style={{
          borderColor: "var(--v3-line-200)",
          background: "rgba(8, 9, 10, 0.92)",
          color: "#F59E0B",
        }}
      >
        <Bug className="h-3.5 w-3.5" />
        Report bug
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 md:items-center md:p-6">
          <div
            className="w-full max-w-[560px] rounded-md border p-4 md:p-5"
            style={{
              background: "var(--v3-bg-025)",
              borderColor: "var(--v3-line-200)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="In-app bug report"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight" style={{ color: "var(--v3-ink-000)" }}>
                Report a bug
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs"
                style={{ color: "var(--v3-ink-300)" }}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs" style={{ color: "var(--v3-ink-200)" }}>
                Summary
                <input
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Short title"
                  className="mt-1 w-full rounded border bg-transparent px-2 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--v3-line-200)", color: "var(--v3-ink-100)" }}
                />
              </label>

              <label className="block text-xs" style={{ color: "var(--v3-ink-200)" }}>
                What happened
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="Steps to reproduce and expected behavior"
                  rows={5}
                  className="mt-1 w-full resize-y rounded border bg-transparent px-2 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--v3-line-200)", color: "var(--v3-ink-100)" }}
                />
              </label>

              <label className="block text-xs" style={{ color: "var(--v3-ink-200)" }}>
                Contact (optional)
                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="email or X handle"
                  className="mt-1 w-full rounded border bg-transparent px-2 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--v3-line-200)", color: "var(--v3-ink-100)" }}
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--v3-line-200)", color: "var(--v3-ink-200)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="rounded px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "#F59E0B", color: "#0b0d10" }}
              >
                Continue to GitHub
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
