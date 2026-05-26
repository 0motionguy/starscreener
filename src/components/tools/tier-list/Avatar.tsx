"use client";

// Avatar — repo avatar with monogram fallback. Pure presentational. Used by
// every tier-list tile in the builder so the look stays consistent whether
// the avatar URL is loaded yet, missing, or available.
//
// Restored from audit/imp-wave-10c-tierlist (old path
// src/components/tier-list/Avatar.tsx) into the canonical tools/tier-list
// subtree. Monogram fallback uses `var(--accent)` (Liquid Lava) + mono font
// instead of the old hardcoded #F56E0F so it tracks theme changes.

import type { CSSProperties } from "react";

interface AvatarProps {
  repoId: string;
  avatarUrl?: string;
  size?: number;
  rounded?: number;
}

export function Avatar({
  repoId,
  avatarUrl,
  size = 40,
  rounded = 4,
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
        backgroundColor: "var(--accent)",
        color: "var(--bg)",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {monogram}
    </span>
  );
}
