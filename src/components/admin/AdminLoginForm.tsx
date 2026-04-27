"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as
        | { ok: true; username: string }
        | { ok: false; reason?: string; error?: string };
      if (!res.ok || data.ok === false) {
        if (data.ok === false && data.reason === "not_configured") {
          throw new Error(
            data.error ?? "Admin login not configured. Check .env.local.",
          );
        }
        throw new Error("Invalid username or password.");
      }
      router.push(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--v2-bg-100)",
    border: "1px solid var(--v2-line-200)",
    borderRadius: 2,
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--v2-ink-100)",
    fontFamily: "var(--font-geist-mono), monospace",
    outline: "none",
  };

  return (
    <main
      className="min-h-screen font-mono"
      style={{ background: "var(--v2-bg-000)", color: "var(--v2-ink-100)" }}
    >
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-4 py-12">
        <header className="mb-5">
          <span
            className="v2-mono"
            style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
          >
            {"// 01 · ADMIN · OPERATOR-LEVEL"}
          </span>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: 32,
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1.1,
            }}
          >
            ADMIN LOGIN
          </h1>
          <p className="mt-1.5" style={{ fontSize: 13, color: "var(--v2-ink-300)" }}>
            {"// sign in to manage feeds, queues, issues"}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="v2-card overflow-hidden"
          autoComplete="on"
        >
          <div className="v2-term-bar">
            <span aria-hidden className="flex items-center gap-1.5">
              <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--v2-line-200)" }}
              />
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--v2-line-200)" }}
              />
            </span>
            <span className="flex-1 truncate" style={{ color: "var(--v2-ink-200)" }}>
              {"// AUTH · CREDENTIAL"}
            </span>
            <span
              className="v2-stat shrink-0"
              style={{ color: "var(--v2-ink-300)" }}
            >
              SECURE
            </span>
          </div>

          <div className="p-5 space-y-4">
            <label className="flex flex-col gap-2">
              <span
                className="v2-mono"
                style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
              >
                {"// USERNAME"}
              </span>
              <input
                type="text"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                style={inputStyle}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span
                className="v2-mono"
                style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
              >
                {"// PASSWORD"}
              </span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </label>

            {error ? (
              <div
                className="v2-mono"
                style={{
                  fontSize: 11,
                  color: "var(--v2-sig-red)",
                  padding: "8px 12px",
                  border: "1px solid var(--v2-sig-red)",
                  borderRadius: 2,
                  background: "rgba(255, 77, 77, 0.06)",
                }}
              >
                {`// AUTH FAILED · ${error}`}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || !password}
              className="v2-btn v2-btn-primary w-full"
              style={{ minHeight: 42 }}
            >
              {busy ? "SIGNING IN…" : "SIGN IN"}
              {!busy ? <span aria-hidden style={{ marginLeft: 8 }}>→</span> : null}
            </button>
          </div>
        </form>

        <p
          className="v2-mono mt-4"
          style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
        >
          {"// CONFIGURED VIA "}
          <span style={{ color: "var(--v2-ink-200)" }}>ADMIN_USERNAME</span>
          {" + "}
          <span style={{ color: "var(--v2-ink-200)" }}>ADMIN_PASSWORD</span>
          {" IN "}
          <span style={{ color: "var(--v2-ink-200)" }}>.env.local</span>
          {" · COOKIE EXPIRES 7D"}
        </p>
      </div>
    </main>
  );
}

export default AdminLoginForm;
