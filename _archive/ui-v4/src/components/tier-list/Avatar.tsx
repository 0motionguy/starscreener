"use client";

import type { CSSProperties } from "react";

interface AvatarProps {
  repoId: string;
  avatarUrl?: string;
  size?: number;
  rounded?: number;
}

/** Repo avatar with monogram fallback. Pure presentational. */
export function Avatar({
  repoId,
  avatarUrl,
  size = 40,
  rounded = 8,
}: AvatarProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded,
    flexShrink: 0,
  };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ ...style, objectFit: "cover" }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const [owner = "", name = ""] = repoId.split("/");
  const monogram = `${owner[0] ?? "?"}${name[0] ?? "?"}`.toUpperCase();

  return (
    <span
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F56E0F",
        color: "#0a0a0a",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {monogram}
    </span>
  );
}
