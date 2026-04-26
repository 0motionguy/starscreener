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

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-4 py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider">
            Admin Login
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {"// sign in to manage feeds, queues, issues"}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-card border border-border-primary bg-bg-card p-5 space-y-4"
          autoComplete="on"
        >
          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
              Username
            </span>
            <input
              type="text"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="rounded-md border border-border-primary bg-bg-muted px-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
              Password
            </span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="rounded-md border border-border-primary bg-bg-muted px-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-down/60 bg-down/5 px-3 py-2 text-sm text-down">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full rounded-md border border-brand/60 bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-brand/20 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-text-tertiary">
          Configured via <code>ADMIN_USERNAME</code> + <code>ADMIN_PASSWORD</code> in{" "}
          <code>.env.local</code>. Cookie expires in 7 days.
        </p>
      </div>
    </main>
  );
}

export default AdminLoginForm;
