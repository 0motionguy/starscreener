// IdeaMarkMini — gradient "bulb" mark for an idea. 5 tone variants
// (.tone-a .. .tone-e) chosen deterministically from the idea id so the
// same idea is always the same color across the board, detail view, and
// related-repos cards. Pure server component (no client JS).

interface IdeaMarkMiniProps {
  ideaId: string;
  size?: "sm" | "lg";
}

const TONES = ["tone-a", "tone-b", "tone-c", "tone-d", "tone-e"] as const;

export function toneFromId(ideaId: string): (typeof TONES)[number] {
  let sum = 0;
  for (let i = 0; i < ideaId.length; i++) sum += ideaId.charCodeAt(i);
  return TONES[sum % TONES.length]!;
}

export function IdeaMarkMini({ ideaId, size = "sm" }: IdeaMarkMiniProps) {
  const tone = toneFromId(ideaId);
  const cls =
    size === "lg" ? `idea-mark-lg ${tone}` : `idea-mark-mini ${tone}`;
  return (
    <div className={cls} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size === "lg" ? 28 : 18} height={size === "lg" ? 28 : 18}>
        <path
          d="M12 3a6 6 0 0 0-3.7 10.7c.6.5 1 1.1 1 1.8v.5h5.4v-.5c0-.7.4-1.3 1-1.8A6 6 0 0 0 12 3zm-2 17h4v1.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V20z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
