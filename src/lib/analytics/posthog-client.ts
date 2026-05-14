export interface BrowserPostHogClient {
  __loaded?: boolean;
  capture(eventName: string, properties?: Record<string, unknown>): unknown;
  debug(): void;
  identify(distinctId: string, properties?: Record<string, unknown>): unknown;
  register(properties: Record<string, unknown>): unknown;
}

export function getLoadedBrowserPostHog(): BrowserPostHogClient | null {
  if (typeof window === "undefined") return null;
  const posthog = (window as unknown as { posthog?: BrowserPostHogClient }).posthog;
  return posthog?.__loaded ? posthog : null;
}
