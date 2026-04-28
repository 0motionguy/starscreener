// V2 design-system primitive — live pulse dot.
// Pure CSS animation, zero JS libraries.

export function LivePulse(): React.ReactElement {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inset-0 rounded-full bg-up opacity-60 animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-up" />
    </span>
  );
}
