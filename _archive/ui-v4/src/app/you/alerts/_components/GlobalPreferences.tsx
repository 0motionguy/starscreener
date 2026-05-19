"use client";

// GlobalPreferences — edits per-profile email + quiet-hours defaults.
//
// PATCHes `/api/me/profile` (Lane 1). All fields are optional in the body;
// we send only what changed since the form was loaded so partial updates
// don't clobber unrelated columns.
//
// Cadence options mirror profiles.email_alerts_cadence: realtime / daily /
// weekly / off. Quiet-hours UI uses HH:MM <input type="time"> pickers, then
// converts to minute-of-day on submit. Timezone uses Intl.supportedValuesOf
// (Node 20+, Chrome 99+) with a bundled fallback for hosts that lack the API.

import { useCallback, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { toastAlertError, toastRuleSaved } from "@/lib/toast";

import type {
  ApiErr,
  ApiOk,
  PatchProfilePrefsBody,
  QuietHours,
  SerializedProfilePrefs,
} from "./types";

interface GlobalPreferencesProps {
  initialPrefs: SerializedProfilePrefs;
}

const CADENCE_OPTIONS = [
  { value: "realtime", label: "Realtime", note: "as soon as a rule fires" },
  { value: "daily", label: "Daily digest", note: "one email at 9am your time" },
  { value: "weekly", label: "Weekly digest", note: "Sunday 9am" },
  { value: "off", label: "Off", note: "rules still log to MCP" },
] as const;

// Lazy timezone list — Intl.supportedValuesOf("timeZone") landed in Node 20.
// We fall back to a small curated list if the runtime doesn't expose it.
function getTimezoneList(): string[] {
  type IntlWithTzList = typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const intlExt = Intl as IntlWithTzList;
  if (typeof intlExt.supportedValuesOf === "function") {
    try {
      return intlExt.supportedValuesOf("timeZone");
    } catch {
      // fall through
    }
  }
  return [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];
}

function minToHHMM(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "";
  const safe = Math.max(0, Math.min(1439, Math.floor(min)));
  const hh = Math.floor(safe / 60).toString().padStart(2, "0");
  const mm = (safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function GlobalPreferences({ initialPrefs }: GlobalPreferencesProps) {
  const tzList = useMemo(getTimezoneList, []);

  const [cadence, setCadence] = useState(initialPrefs.emailAlertsCadence);
  const [timezone, setTimezone] = useState(initialPrefs.timezone);
  const [useQuietHours, setUseQuietHours] = useState(
    initialPrefs.quietHours !== null,
  );
  const [quietStart, setQuietStart] = useState(
    minToHHMM(initialPrefs.quietHours?.startMin) || "22:00",
  );
  const [quietEnd, setQuietEnd] = useState(
    minToHHMM(initialPrefs.quietHours?.endMin) || "07:00",
  );
  const [emailReferralUpdates, setEmailReferralUpdates] = useState(
    initialPrefs.emailReferralUpdates,
  );
  const [emailProductUpdates, setEmailProductUpdates] = useState(
    initialPrefs.emailProductUpdates,
  );
  const [emailSystem, setEmailSystem] = useState(initialPrefs.emailSystem);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (submitting) return;

      // Compute diff vs. initialPrefs so we send only changed fields.
      const body: PatchProfilePrefsBody = {};
      if (cadence !== initialPrefs.emailAlertsCadence) {
        // Cadence values mirror EmailAlertsCadence runtime check; the route
        // re-validates so ANY string would 400 cleanly here.
        body.emailAlertsCadence = cadence as PatchProfilePrefsBody["emailAlertsCadence"];
      }
      if (timezone !== initialPrefs.timezone) {
        body.timezone = timezone;
      }
      if (emailReferralUpdates !== initialPrefs.emailReferralUpdates) {
        body.emailReferralUpdates = emailReferralUpdates;
      }
      if (emailProductUpdates !== initialPrefs.emailProductUpdates) {
        body.emailProductUpdates = emailProductUpdates;
      }
      if (emailSystem !== initialPrefs.emailSystem) {
        body.emailSystem = emailSystem;
      }

      // Quiet hours: send `null` to clear, or a `{startMin, endMin}` object.
      const initialQH = initialPrefs.quietHours;
      let nextQH: QuietHours | null = null;
      if (useQuietHours) {
        const startMin = parseHHMM(quietStart);
        const endMin = parseHHMM(quietEnd);
        if (startMin === null || endMin === null) {
          toastAlertError("Quiet hours must be HH:MM");
          return;
        }
        nextQH = { startMin, endMin };
      }
      const qhChanged =
        (initialQH === null) !== (nextQH === null) ||
        (initialQH !== null &&
          nextQH !== null &&
          (initialQH.startMin !== nextQH.startMin ||
            initialQH.endMin !== nextQH.endMin));
      if (qhChanged) {
        body.quietHours = nextQH;
      }

      if (Object.keys(body).length === 0) {
        toastAlertError("Nothing changed.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/me/profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as
          | ApiOk<{ profile: unknown }>
          | ApiErr;
        if (!res.ok || data.ok === false) {
          throw new Error(
            (data as ApiErr).message ||
              (data as ApiErr).error ||
              `HTTP ${res.status}`,
          );
        }
        toastRuleSaved();
      } catch (err) {
        toastAlertError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [
      cadence,
      emailProductUpdates,
      emailReferralUpdates,
      emailSystem,
      initialPrefs.emailAlertsCadence,
      initialPrefs.emailProductUpdates,
      initialPrefs.emailReferralUpdates,
      initialPrefs.emailSystem,
      initialPrefs.quietHours,
      initialPrefs.timezone,
      quietEnd,
      quietStart,
      submitting,
      timezone,
      useQuietHours,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      {/* Cadence */}
      <fieldset>
        <legend
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Default email cadence
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CADENCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="cursor-pointer rounded-[2px] border p-2"
              style={
                cadence === opt.value
                  ? {
                      borderColor: "var(--v3-acc)",
                      background: "var(--v3-acc-soft)",
                    }
                  : {
                      borderColor: "var(--v3-line-200)",
                      background: "var(--v3-bg-050)",
                    }
              }
            >
              <input
                type="radio"
                name="cadence"
                value={opt.value}
                checked={cadence === opt.value}
                onChange={() => setCadence(opt.value)}
                className="sr-only"
              />
              <div
                className="font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{
                  color:
                    cadence === opt.value
                      ? "var(--v3-acc)"
                      : "var(--v3-ink-100)",
                  fontWeight: 500,
                }}
              >
                {opt.label}
              </div>
              <div
                className="mt-0.5 text-xs"
                style={{ color: "var(--v3-ink-300)" }}
              >
                {opt.note}
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Timezone */}
      <fieldset>
        <legend
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Timezone
        </legend>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-[2px] border px-3 py-2 font-mono text-sm sm:max-w-md"
          style={{
            borderColor: "var(--v3-line-200)",
            background: "var(--v3-bg-050)",
            color: "var(--v3-ink-100)",
          }}
        >
          {tzList.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs" style={{ color: "var(--v3-ink-400)" }}>
          Used for daily/weekly digest scheduling and quiet-hour math.
        </p>
      </fieldset>

      {/* Quiet hours */}
      <fieldset>
        <legend
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Quiet hours
        </legend>
        <label
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: "var(--v3-ink-200)" }}
        >
          <input
            type="checkbox"
            checked={useQuietHours}
            onChange={(e) => setUseQuietHours(e.target.checked)}
          />
          Suppress realtime emails during a daily window
        </label>
        {useQuietHours ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: "var(--v3-ink-300)" }}>From</span>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="rounded-[2px] border px-2 py-1 font-mono text-xs"
              style={{
                borderColor: "var(--v3-line-200)",
                background: "var(--v3-bg-050)",
                color: "var(--v3-ink-100)",
              }}
            />
            <span style={{ color: "var(--v3-ink-300)" }}>to</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="rounded-[2px] border px-2 py-1 font-mono text-xs"
              style={{
                borderColor: "var(--v3-line-200)",
                background: "var(--v3-bg-050)",
                color: "var(--v3-ink-100)",
              }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              ({timezone})
            </span>
          </div>
        ) : null}
      </fieldset>

      {/* Email categories */}
      <fieldset>
        <legend
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Email categories
        </legend>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={emailReferralUpdates}
              onChange={(e) => setEmailReferralUpdates(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span style={{ color: "var(--v3-ink-100)", fontWeight: 500 }}>
                Referral updates
              </span>
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                — milestones reached, friend signed up
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={emailProductUpdates}
              onChange={(e) => setEmailProductUpdates(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span style={{ color: "var(--v3-ink-100)", fontWeight: 500 }}>
                Product updates
              </span>
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                — new features, blog posts (off by default)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={emailSystem}
              onChange={(e) => setEmailSystem(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span style={{ color: "var(--v3-ink-100)", fontWeight: 500 }}>
                System
              </span>
              <span
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                — security alerts, password reset (recommended ON)
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <footer className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--v3-acc-soft)",
            border: "1px solid var(--v3-acc-dim)",
            color: "var(--v3-acc)",
            fontWeight: 500,
          }}
        >
          {submitting ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          Save preferences
        </button>
      </footer>
    </form>
  );
}

export default GlobalPreferences;
