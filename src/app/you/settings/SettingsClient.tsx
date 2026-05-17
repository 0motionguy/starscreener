"use client";

// /you/settings client shell (S3.5.B).
//
// Profile form (display name + avatar URL) PATCHes the existing
// `/api/me/profile` endpoint which was extended in this PR to accept
// the two user-controlled fields. The page is intentionally minimal —
// we leave email cadence + quiet hours to /you/alerts where the full
// GlobalPreferences picker already lives.
//
// A "Danger Zone" placeholder is reserved for the S3.5.A GDPR account
// deletion flow; this PR ships the layout without the delete API so
// the next PR can land the destructive endpoint without touching the
// page shell again.

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { toast } from "@/lib/toast";

export interface SettingsInitialProfile {
  handle: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SettingsClientProps {
  initialProfile: SettingsInitialProfile;
}

export default function SettingsClient({
  initialProfile,
}: SettingsClientProps) {
  const [displayName, setDisplayName] = useState(
    initialProfile.displayName ?? "",
  );
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        displayName: displayName.trim().length > 0 ? displayName.trim() : null,
      };
      if (avatarUrl.trim().length > 0) {
        body.avatarUrl = avatarUrl.trim();
      } else {
        // Send null so the column clears.
        body.avatarUrl = null;
      }
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`profile patch failed: ${res.status}`);
      }
      toast.info("Profile updated.");
    } catch (err) {
      console.warn("[settings] profile patch failed", err);
      toast.info("Couldn't save profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="mx-auto max-w-[760px] px-4 py-6 md:px-6 md:py-8">
        <header
          className="mb-6 pb-4"
          style={{ borderBottom: "1px solid var(--v3-line-200)" }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// 02 · YOU · SETTINGS"}
          </span>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v3-ink-000)",
              lineHeight: 1.1,
            }}
          >
            Account settings
          </h1>
          <p
            className="mt-2 max-w-xl text-sm"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Edit how you appear across TrendingRepo. Notification cadence and
            quiet hours live in{" "}
            <Link
              href="/you/alerts"
              style={{ color: "var(--v3-acc)" }}
            >
              /you/alerts
            </Link>
            .
          </p>
        </header>

        <section
          className="rounded-[2px] p-4 md:p-5"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-300)" }}
          >
            {"// PROFILE"}
          </div>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-4"
          >
            <ReadOnlyRow label="Handle" value={`@${initialProfile.handle}`} />
            <ReadOnlyRow label="Email" value={initialProfile.email} />

            <label className="flex flex-col gap-1.5">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                Display name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
                maxLength={80}
                placeholder={`@${initialProfile.handle}`}
                className="h-10 rounded-[2px] px-3 text-sm outline-none"
                style={{
                  background: "var(--v3-bg-075)",
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-100)",
                }}
              />
              <span
                className="font-mono text-[10px]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                {displayName.length} / 80 — shown alongside @{initialProfile.handle} on your public profile.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                Avatar URL (https://)
              </span>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value.slice(0, 1024))}
                placeholder="https://example.com/avatar.png"
                className="h-10 rounded-[2px] px-3 text-sm outline-none"
                style={{
                  background: "var(--v3-bg-075)",
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-100)",
                }}
              />
              <span
                className="font-mono text-[10px]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                Optional. Leave empty to fall back to your initial avatar.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                style={{
                  background: "var(--v3-bg-075)",
                  border: "1px solid var(--v3-acc, var(--v3-line-200))",
                  color: "var(--v3-acc, var(--v3-ink-100))",
                  fontWeight: 500,
                }}
              >
                {busy ? "SAVING…" : "SAVE PROFILE"}
              </button>
            </div>
          </form>
        </section>

        <section
          className="mt-6 rounded-[2px] p-4 md:p-5"
          style={{
            background: "var(--v3-bg-050)",
            border: "1px solid var(--v3-line-200)",
          }}
        >
          <div
            className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-300)" }}
          >
            {"// DANGER ZONE"}
          </div>
          <p
            className="text-sm"
            style={{ color: "var(--v3-ink-200)", marginBottom: 8 }}
          >
            Account deletion (GDPR right-to-erasure) ships in the next PR
            alongside the destructive backend endpoint. Hold off on wiring
            until then.
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] opacity-50 cursor-not-allowed"
            style={{
              background: "transparent",
              border: "1px solid var(--v3-down, var(--v3-line-200))",
              color: "var(--v3-down, var(--v3-ink-300))",
            }}
            aria-label="Delete account (coming soon)"
          >
            DELETE ACCOUNT
          </button>
        </section>
      </div>
    </main>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-sm"
        style={{ color: "var(--v3-ink-100)" }}
      >
        {value}
      </span>
    </div>
  );
}
