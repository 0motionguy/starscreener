export function SystemMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block shrink-0"
    >
      <rect width="24" height="24" fill="var(--v3-acc)" />
      <rect x="6" y="17" width="6" height="2" fill="var(--v3-bg-000)" />
      <rect x="6" y="13" width="9" height="2" fill="var(--v3-bg-000)" />
      <rect x="6" y="9" width="12" height="2" fill="var(--v3-bg-000)" />
      <rect x="6" y="5" width="14" height="2" fill="var(--v3-bg-000)" />
    </svg>
  );
}
