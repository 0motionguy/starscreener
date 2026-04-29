// Theme bootstrap is owned by the inline <script> in src/app/layout.tsx
// (it runs before first paint, reads V3_THEME_STORAGE_KEY, and writes
// the same CSS variables this provider used to set). User-driven theme
// changes go through AccentPicker, which calls applyV3AccentTheme
// directly. Re-applying on mount here was pure duplication of the head
// script's work and shipped a one-shot effect to every page bundle.

export function DesignSystemProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="v3-root">{children}</div>;
}
