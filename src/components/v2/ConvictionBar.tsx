// V2 design-system primitive — gradient conviction bar.
// Width driven by 0–100 value. Glows at high values.

interface ConvictionBarProps {
  value: number;
}

export function ConvictionBar({ value }: ConvictionBarProps): React.ReactElement {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="mt-3 relative h-2 rounded-full bg-border-primary overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${clamped}%`,
          background:
            "linear-gradient(90deg, #FBBF24 0%, #F56E0F 50%, #EF4444 100%)",
          boxShadow: "0 0 12px rgba(245, 110, 15, 0.6)",
        }}
      />
    </div>
  );
}
