// Sentinel-style selection markers — Node/01's vocabulary for "this is
// the focused object". Renders four 8x8 orange filled squares at the
// corners of the parent (.v2-bracket on parent), plus an optional 1px
// dashed inner frame.
//
// Usage: parent must have `position: relative` and the class `v2-bracket`.

interface BracketMarkersProps {
  /** When true, also draws the inner dashed frame. */
  dashed?: boolean;
}

export function BracketMarkers({ dashed = false }: BracketMarkersProps = {}) {
  return (
    <>
      <span className="v2-br1" aria-hidden />
      <span className="v2-br2" aria-hidden />
      {dashed ? <span className="v2-bracket-dash" aria-hidden /> : null}
    </>
  );
}
