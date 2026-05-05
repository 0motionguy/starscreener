import { AuthFatalError, AuthQuarantineError } from "@/lib/errors";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileApiResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "not_configured" | "failed" };

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp: string,
): Promise<TurnstileVerdict> {
  if (!token || !token.trim()) {
    return { ok: false, reason: "missing_token" };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, reason: "not_configured" };
  }

  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token.trim(),
        remoteip: remoteIp || "unknown",
      }),
      cache: "no-store",
    });
  } catch (err) {
    throw new AuthFatalError("turnstile verification request failed", {
      scope: "api/turnstile",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (!response.ok) {
    throw new AuthFatalError("turnstile verification returned non-200", {
      scope: "api/turnstile",
      status: response.status,
    });
  }

  let payload: TurnstileApiResponse;
  try {
    payload = (await response.json()) as TurnstileApiResponse;
  } catch {
    throw new AuthFatalError("turnstile verification returned invalid json", {
      scope: "api/turnstile",
    });
  }

  if (payload.success) return { ok: true };

  throw new AuthQuarantineError("turnstile verification rejected token", {
    scope: "api/turnstile",
    codes: payload["error-codes"] ?? [],
  });
}

