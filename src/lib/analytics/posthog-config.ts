export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

type PostHogEnv = Record<string, string | undefined>;

function cleanEnvValue(value: string | undefined | null): string | undefined {
  const cleaned = value?.trim().replace(/\s+/g, "");
  return cleaned ? cleaned : undefined;
}

export function normalizePostHogHost(host: string | undefined | null): string {
  return (cleanEnvValue(host) ?? DEFAULT_POSTHOG_HOST).replace(/\/+$/, "");
}

export function resolvePublicPostHogConfig(env: PostHogEnv = process.env) {
  return {
    key:
      cleanEnvValue(env.NEXT_PUBLIC_POSTHOG_KEY) ??
      cleanEnvValue(env.NEXT_PUBLIC_POSTHOG_TOKEN),
    host: normalizePostHogHost(env.NEXT_PUBLIC_POSTHOG_HOST),
  };
}

export function resolveServerPostHogConfig(env: PostHogEnv = process.env) {
  return {
    key: cleanEnvValue(env.POSTHOG_KEY) ?? cleanEnvValue(env.POSTHOG_API_KEY),
    host: normalizePostHogHost(
      cleanEnvValue(env.POSTHOG_HOST) ?? cleanEnvValue(env.NEXT_PUBLIC_POSTHOG_HOST),
    ),
  };
}
