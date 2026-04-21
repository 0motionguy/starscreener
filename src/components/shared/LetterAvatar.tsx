"use client";

// Small reusable letter avatar — first character of `seed` painted on a
// stable hashed hue. Used in the Reddit trending feed rows for both the
// 28px PostRow avatar and the 20px PostRowCompact avatar.

interface LetterAvatarProps {
  /** String the letter is derived from (e.g. subreddit name "ClaudeCode" → "C"). */
  seed: string;
  /** Pixel size. Defaults to 28. */
  size?: number;
}

/**
 * Hash a string into a stable hue (0-330 in 30° steps → 12 distinct hues).
 * Sum of char codes mod 360, then snap to nearest 30°.
 */
function hueFromSeed(seed: string): number {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) {
    sum += seed.charCodeAt(i);
  }
  const raw = sum % 360;
  return Math.round(raw / 30) * 30;
}

export function LetterAvatar({ seed, size = 28 }: LetterAvatarProps) {
  const safeSeed = seed && seed.length > 0 ? seed : "?";
  const letter = safeSeed.charAt(0).toUpperCase();
  const hue = hueFromSeed(safeSeed);
  const fontSize = Math.round(size * 0.42);

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white select-none"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${fontSize}px`,
        backgroundColor: `hsl(${hue}, 50%, 35%)`,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
}
