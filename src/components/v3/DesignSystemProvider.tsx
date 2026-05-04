// Theme bootstrap is owned by the inline <script> in src/app/layout.tsx.
// The provider API is kept stable while the rendered shell uses the V4 root
// contract.

export function DesignSystemProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="v4-root">{children}</div>;
}
