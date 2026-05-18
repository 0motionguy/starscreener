"use client";

// /you/settings client shell (S3.5.B + S3.5.A).
//
// Profile form (display name + avatar URL) PATCHes the existing
// `/api/me/profile` endpoint which was extended to accept the two
// user-controlled fields. The page is intentionally minimal — email
// cadence + quiet hours live in /you/alerts.
//
// Danger Zone (S3.5.A) shows a DELETE ACCOUNT button that opens a
// type-to-confirm dialog and POSTs `/api/account/delete` on submit.
// Successful delete redirects to /sign-out (Clerk's sign-out route)
// so the session terminates before the user lands back on home.

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { toast } from "@/lib/toast";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteConfirmEmail.trim() }),
      });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `delete failed: ${res.status}`);
      }
      try {
        getLoadedBrowserPostHog()?.capture("account_deleted", {
          source: "settings_danger_zone",
        });
      } catch {
        // analytics must never throw upstream
      }
      // Sign out + bounce to home. Clerk's sign-out route handles the
      // session cookie clear; we replace the URL so the back button
      // doesn't return to a now-orphaned /you.
      window.location.replace("/sign-out");
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Couldn't delete account. Please try again.",
      );
      setDeleteBusy(false);
    }
  }

  const deleteArmed =
    deleteConfirmEmail.trim().toLowerCase() ===
    initialProfile.email.toLowerCase();

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
            style={{ color: "var(--v3-down, var(--v3-ink-300))" }}
          >
            {"// DANGER ZONE"}
          </div>
          <p
            className="text-sm"
            style={{ color: "var(--v3-ink-200)", marginBottom: 8 }}
          >
            Deletes your profile, alert rules, referrals, and watchlist.
            We soft-delete locally and best-effort remove your identity at
            Clerk. This action is irreversible after a 30-day operator
            grace window.
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteConfirmEmail("");
                setDeleteError(null);
              }}
              className="inline-flex items-center rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors"
              style={{
                background: "transparent",
                border: "1px solid var(--v3-down, var(--v3-line-200))",
                color: "var(--v3-down, var(--v3-ink-100))",
              }}
              aria-label="Open delete account confirmation"
            >
              DELETE ACCOUNT
            </button>
          ) : (
            <div
              className="rounded-[2px] p-3"
              style={{
                background: "var(--v3-bg-025, var(--v3-bg-050))",
                border: "1px solid var(--v3-down, var(--v3-line-200))",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--v3-ink-100)", margin: 0 }}
              >
                Type your account email <code style={{ color: "var(--v3-ink-100)" }}>{initialProfile.email}</code> to confirm.
              </p>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) =>
                  setDeleteConfirmEmail(e.target.value.slice(0, 254))
                }
                placeholder={initialProfile.email}
                aria-label="Confirm account email"
                className="h-10 rounded-[2px] px-3 text-sm outline-none"
                style={{
                  background: "var(--v3-bg-075)",
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-100)",
                }}
              />
              {deleteError ? (
                <p
                  role="alert"
                  className="text-xs"
                  style={{
                    color: "var(--v3-down, #ef4444)",
                    margin: 0,
                  }}
                >
                  {deleteError}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmEmail("");
                    setDeleteError(null);
                  }}
                  disabled={deleteBusy}
                  className="inline-flex items-center rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] disabled:opacity-50"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--v3-line-200)",
                    color: "var(--v3-ink-200)",
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={!deleteArmed || deleteBusy}
                  className="inline-flex items-center rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] disabled:opacity-40"
                  style={{
                    background: "var(--v3-down, transparent)",
                    border: "1px solid var(--v3-down, #ef4444)",
                    color: "#fff",
                    fontWeight: 600,
                  }}
                >
                  {deleteBusy ? "DELETING…" : "PERMANENTLY DELETE"}
                </button>
              </div>
            </div>
          )}
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
