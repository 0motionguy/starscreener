"use client";

// Client form for pasting AISO.tools API access. Stores the values via the
// /api/account/aiso-pref endpoint as an http-only cookie. The UI never sees
// the raw key back — `apiKeyMasked` is what reads display.

import { useState } from "react";

import type { AisoUserPrefsDisplay } from "@/lib/aiso-user-prefs";

interface AccountAisoSettingsProps {
  initial: AisoUserPrefsDisplay;
}

type State =
  | { kind: "idle"; configured: boolean; maskedKey: string; baseUrl: string }
  | { kind: "saving"; baseUrl: string; maskedKey: string }
  | { kind: "saved"; baseUrl: string; maskedKey: string }
  | { kind: "cleared" }
  | { kind: "error"; message: string };

export function AccountAisoSettings({ initial }: AccountAisoSettingsProps) {
  const [state, setState] = useState<State>({
    kind: "idle",
    configured: initial.configured,
    maskedKey: initial.apiKeyMasked,
    baseUrl: initial.baseUrl,
  });
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [apiKey, setApiKey] = useState("");

  const onSave = async () => {
    if (!baseUrl.trim() || apiKey.trim().length < 4) {
      setState({
        kind: "error",
        message: "Paste a valid URL and a key with ≥ 4 characters.",
      });
      return;
    }
    setState({ kind: "saving", baseUrl, maskedKey: "" });
    try {
      const response = await fetch("/api/account/aiso-pref", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        setState({
          kind: "error",
          message: typeof data?.error === "string" ? data.error : "Save failed",
        });
        return;
      }
      setState({
        kind: "saved",
        baseUrl: typeof data?.baseUrl === "string" ? data.baseUrl : baseUrl,
        maskedKey:
          typeof data?.apiKeyMasked === "string" ? data.apiKeyMasked : "",
      });
      setApiKey("");
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  const onClear = async () => {
    setState({ kind: "saving", baseUrl, maskedKey: "" });
    try {
      const response = await fetch("/api/account/aiso-pref", {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        setState({ kind: "error", message: "Clear failed" });
        return;
      }
      setState({ kind: "cleared" });
      setBaseUrl("https://aiso.tools");
      setApiKey("");
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  const isConfigured =
    state.kind === "saved" ||
    (state.kind === "idle" && state.configured) ||
    state.kind === "saving";

  const status =
    state.kind === "saved"
      ? `Saved · ${state.maskedKey || "key set"} on ${state.baseUrl}`
      : state.kind === "cleared"
        ? "Cleared — AISO scans fall back to the public scanner."
        : state.kind === "error"
          ? `Error · ${state.message}`
          : state.kind === "saving"
            ? "Saving…"
            : isConfigured
              ? `Configured · ${initial.apiKeyMasked} on ${initial.baseUrl}`
              : "Not configured · using public AISO.tools scanner";

  return (
    <section
      className="card aiso-settings-card"
      aria-labelledby="aiso-settings-head"
    >
      <div className="card-head">
        <h2 className="card-title" id="aiso-settings-head">
          ▌ <b>AISO.tools</b> · API access
        </h2>
        <span className="grow" />
        <span
          className={`chip ${isConfigured ? "up" : "info"}`}
          aria-live="polite"
        >
          {isConfigured ? "configured" : "default"}
        </span>
      </div>
      <div className="aiso-settings-body">
        <p className="aiso-settings-help">
          Paste an AISO.tools instance URL + API key to route scans through
          your own quota. Leave blank to use the public scanner at
          aiso.tools. The key is stored in an http-only cookie scoped to this
          browser session.
        </p>
        <label className="aiso-settings-field">
          <span className="aiso-settings-label">Endpoint URL</span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://aiso.tools"
            className="aiso-settings-input"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="aiso-settings-field">
          <span className="aiso-settings-label">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              isConfigured ? "leave blank to keep saved key" : "sk-..."
            }
            className="aiso-settings-input"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="aiso-settings-actions">
          <button
            type="button"
            className="btn primary sm"
            onClick={onSave}
            disabled={state.kind === "saving"}
          >
            {state.kind === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onClear}
            disabled={state.kind === "saving"}
          >
            Clear
          </button>
        </div>
        <div className="aiso-settings-status" aria-live="polite">
          {status}
        </div>
      </div>
    </section>
  );
}
