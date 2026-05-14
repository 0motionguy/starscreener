interface AuthUnavailableProps {
  action: string;
}

export function AuthUnavailable({ action }: AuthUnavailableProps) {
  return (
    <div
      className="max-w-md rounded p-6 text-center"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        color: "var(--v4-ink-100)",
      }}
    >
      <h1 className="text-lg font-semibold">Auth unavailable</h1>
      <p
        className="mt-2 text-sm"
        style={{ color: "var(--v4-ink-300)" }}
      >
        Clerk is not configured for this environment, so {action} is disabled.
      </p>
    </div>
  );
}
