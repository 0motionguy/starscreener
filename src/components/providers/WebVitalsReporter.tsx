"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

const CONSENT_KEY = "trendingrepo-cookie-consent-v1";
const CONSENT_EVENT = "trendingrepo:cookie-consent-changed";
const WEB_VITAL_NAMES = new Set(["LCP", "INP", "CLS"]);

type VitalName = "LCP" | "INP" | "CLS";

type VitalPayload = {
  metric_name: VitalName;
  metric_id: string;
  value: number;
  delta: number;
  rating?: string;
  route: string;
};

type MetricsWindow = Window & {
  __trWebVitalsQueue?: VitalPayload[];
};

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

function enqueue(payload: VitalPayload): void {
  const win = window as MetricsWindow;
  if (!win.__trWebVitalsQueue) win.__trWebVitalsQueue = [];
  win.__trWebVitalsQueue.push(payload);
}

function flushQueue(): void {
  const win = window as MetricsWindow;
  if (!hasAnalyticsConsent() || !posthog.__loaded) return;

  const queue = win.__trWebVitalsQueue;
  if (!queue || queue.length === 0) return;

  while (queue.length > 0) {
    const payload = queue.shift();
    if (!payload) continue;
    posthog.capture("web_vital", payload);
  }
}

export function WebVitalsReporter() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    if (!WEB_VITAL_NAMES.has(metric.name)) return;

    const payload: VitalPayload = {
      metric_name: metric.name as VitalName,
      metric_id: metric.id,
      value: Number(metric.value.toFixed(2)),
      delta: Number(metric.delta.toFixed(2)),
      rating: metric.rating,
      route: pathname || "/",
    };

    enqueue(payload);
    flushQueue();
  });

  useEffect(() => {
    const onConsentChange = () => flushQueue();
    window.addEventListener(CONSENT_EVENT, onConsentChange);

    const intervalId = window.setInterval(flushQueue, 1500);
    flushQueue();

    return () => {
      window.removeEventListener(CONSENT_EVENT, onConsentChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
