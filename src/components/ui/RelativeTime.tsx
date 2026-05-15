"use client";

import { useEffect, useState } from "react";

import { getRelativeTime } from "@/lib/utils";

interface RelativeTimeProps {
  iso: string;
  className?: string;
  prefix?: string;
  suffix?: string;
  title?: string;
}

function safeRelativeTime(iso: string): string {
  try {
    const label = getRelativeTime(iso);
    return label.includes("NaN") ? "unknown" : label;
  } catch {
    return "unknown";
  }
}

export function RelativeTime({
  iso,
  className,
  prefix = "",
  suffix = "",
  title,
}: RelativeTimeProps) {
  const [label, setLabel] = useState(() => safeRelativeTime(iso));

  useEffect(() => {
    const update = () => setLabel(safeRelativeTime(iso));
    update();
    const intervalId = window.setInterval(update, 60_000);
    return () => window.clearInterval(intervalId);
  }, [iso]);

  return (
    <time
      dateTime={iso}
      title={title ?? iso}
      className={className}
      suppressHydrationWarning
    >
      {prefix}
      {label}
      {suffix}
    </time>
  );
}
