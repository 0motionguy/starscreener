"use client";

// Single shared logo / avatar primitive. Renders an image when src is
// present and resolves; otherwise (or on 404) falls back to a monogram
// tile with a deterministic hue derived from the entity name. Used by
// every feed surface so a missing logo never leaves a dead grey square.
//
// Client component because we need onError to swap to the monogram. The
// fallback render happens synchronously on mount, so there's no flash of
// empty space while the image loads.

import { useState } from "react";
import { monogramInitial, monogramTone } from "@/lib/logos";

type LogoSize = 16 | 20 | 24 | 28 | 32 | 40 | 48;
type LogoShape = "square" | "circle";

interface EntityLogoProps {
  /** Image URL — null/undefined falls straight to monogram. */
  src?: string | null;
  /** Entity name — used to pick the monogram letter + tone. */
  name: string;
  /** Pixel size. Square — width === height. Default 20. */
  size?: LogoSize;
  /** Border-radius style. "square" = 2px (v3); "circle" = 50%. */
  shape?: LogoShape;
  /** ARIA / title text. Defaults to name. Pass empty string to mark decorative. */
  alt?: string;
  /** Tailwind shrink-0 wrapper class hook. */
  className?: string;
}

export function EntityLogo({
  src,
  name,
  size = 20,
  shape = "square",
  alt,
  className = "",
}: EntityLogoProps) {
  // Track whether the network image has failed so we can fall back to
  // the monogram. State is initialised from `!src` so the monogram path
  // runs synchronously when no URL is supplied at all.
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;

  const tone = monogramTone(name);
  const letter = monogramInitial(name);
  const radius = shape === "circle" ? "50%" : 2;
  const fontSize = Math.max(9, Math.round(size * 0.42));

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${showImage ? "var(--v3-line-200)" : tone.border}`,
    background: showImage ? "var(--v3-bg-100)" : tone.bg,
  };

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src ?? undefined}
        alt={alt ?? name}
        title={alt === "" ? undefined : (alt ?? name)}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setErrored(true)}
        className={className}
        style={{
          ...baseStyle,
          objectFit: "cover",
        }}
      />
    );
  }

  return (
    <span
      aria-label={alt ?? name}
      title={alt === "" ? undefined : (alt ?? name)}
      role={alt === "" ? "presentation" : "img"}
      className={className}
      style={{
        ...baseStyle,
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: tone.fg,
        textTransform: "uppercase",
      }}
    >
      {letter}
    </span>
  );
}

export default EntityLogo;
