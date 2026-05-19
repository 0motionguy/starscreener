import Image from "next/image";

// Brand-mark replacement for the unicode "★" rank glyph used to flag the
// top-ranked rows on /, /githubrepo, /skills, /mcp, /consensus, and the
// homepage consensus board. The shape matches our favicon
// (public/brand/trendingrepo-mark.svg) so the rank decoration is on-brand
// instead of a generic Unicode codepoint.
//
// Sized at 12px square — slightly larger than the previous 10px star but
// readable at table density. Inline-block + vertical-align to sit on the
// text baseline next to the rank number. `alt=""` keeps it decorative
// for screen readers (the ranked number is read instead).

export function RankStarMark({ size = 12 }: { size?: number }) {
  return (
    <Image
      src="/brand/trendingrepo-mark.svg"
      alt=""
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle" }}
      aria-hidden
    />
  );
}
