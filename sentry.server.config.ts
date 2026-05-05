import * as Sentry from "@sentry/nextjs";
import { sanitizeTelemetryValue } from "@/lib/log-redaction";

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    profilesSampleRate: 0,

    beforeSend(event, hint) {
      const error = hint.originalException as Error | undefined;
      const message = error?.message ?? event.message ?? "";

      if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message) && event.level !== "fatal") {
        event.fingerprint = ["network-transient", message.slice(0, 80)];
      }

      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
          ...crumb,
          message:
            typeof crumb.message === "string"
              ? (sanitizeTelemetryValue(crumb.message) as string)
              : crumb.message,
          category:
            typeof crumb.category === "string"
              ? (sanitizeTelemetryValue(crumb.category) as string)
              : crumb.category,
          data: sanitizeTelemetryValue(crumb.data) as typeof crumb.data,
        }));
      }

      return event;
    },

    beforeBreadcrumb(crumb) {
      return {
        ...crumb,
        message:
          typeof crumb.message === "string"
            ? (sanitizeTelemetryValue(crumb.message) as string)
            : crumb.message,
        category:
          typeof crumb.category === "string"
            ? (sanitizeTelemetryValue(crumb.category) as string)
            : crumb.category,
        data: sanitizeTelemetryValue(crumb.data) as typeof crumb.data,
      };
    },

    initialScope: {
      tags: {
        runtime: "nodejs",
        product: "trendingrepo",
      },
    },
  });
}
