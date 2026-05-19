"use client";

// IdeaReactionsRow — six tappable reaction chips. The four committed
// reaction types (build/use/buy/invest) write through to /api/reactions;
// the two "expression" ones (fire/target) toggle local-only — backend
// doesn't model them yet (Phase 4C extension).
//
// Auth gating: anonymous callers see a one-shot inline "Sign in to react"
// message instead of an alert(). We rely on the API to reject anon POSTs
// — UI optimism is bounded by the server's "ok: false / 401" response.

import { useCallback, useState } from "react";

import {
  REACTION_TYPES,
  type ReactionCounts,
  type ReactionType,
  type UserReactionState,
} from "@/lib/reactions-shape";

interface IdeaReactionsRowProps {
  ideaId: string;
  initialCounts: ReactionCounts;
  initialMine: UserReactionState | null;
  signedIn: boolean;
}

interface ChipDef {
  type: ReactionType | "fire" | "target";
  label: string;
  emoji: string;
  weighted: boolean;
}

const CHIPS: ChipDef[] = [
  { type: "fire", label: "Fire", emoji: "🔥", weighted: false },
  { type: "build", label: "Build", emoji: "💡", weighted: true },
  { type: "use", label: "Use", emoji: "🚀", weighted: true },
  { type: "target", label: "Target", emoji: "🎯", weighted: false },
  { type: "buy", label: "Buy", emoji: "✓", weighted: true },
  { type: "invest", label: "Invest", emoji: "💸", weighted: true },
];

export function IdeaReactionsRow({
  ideaId,
  initialCounts,
  initialMine,
  signedIn,
}: IdeaReactionsRowProps) {
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  const [mine, setMine] = useState<UserReactionState>(
    initialMine ?? { build: false, use: false, buy: false, invest: false },
  );
  // Local-only expression chips. Persisted to localStorage so a refresh
  // doesn't reset them but the server still doesn't know.
  const [localChips, setLocalChips] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(`idea-expr:${ideaId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggleServer = useCallback(
    async (rt: ReactionType) => {
      if (!signedIn) {
        setErrorMsg("Sign in to react");
        return;
      }
      setBusy(rt);
      setErrorMsg(null);
      // Optimistic
      const wasOn = mine[rt];
      setCounts((c) => ({ ...c, [rt]: Math.max(0, c[rt] + (wasOn ? -1 : 1)) }));
      setMine((m) => ({ ...m, [rt]: !wasOn }));
      try {
        const res = await fetch("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            objectType: "idea",
            objectId: ideaId,
            reactionType: rt,
          }),
        });
        if (!res.ok) {
          // Rollback
          setCounts((c) => ({ ...c, [rt]: Math.max(0, c[rt] + (wasOn ? 1 : -1)) }));
          setMine((m) => ({ ...m, [rt]: wasOn }));
          if (res.status === 401) setErrorMsg("Sign in to react");
          else setErrorMsg("Couldn't save reaction — try again");
        } else {
          const json = (await res.json()) as {
            counts: ReactionCounts;
            mine: UserReactionState;
          };
          setCounts(json.counts);
          setMine(json.mine);
        }
      } catch {
        setCounts((c) => ({ ...c, [rt]: Math.max(0, c[rt] + (wasOn ? 1 : -1)) }));
        setMine((m) => ({ ...m, [rt]: wasOn }));
        setErrorMsg("Network error");
      } finally {
        setBusy(null);
      }
    },
    [ideaId, mine, signedIn],
  );

  const toggleLocal = useCallback(
    (key: "fire" | "target") => {
      setLocalChips((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          window.localStorage.setItem(`idea-expr:${ideaId}`, JSON.stringify(next));
        } catch {
          /* quota — ignore */
        }
        return next;
      });
    },
    [ideaId],
  );

  return (
    <div className="ireact-row" role="group" aria-label="React to idea">
      {CHIPS.map((c) => {
        const isOn = c.weighted
          ? mine[c.type as ReactionType]
          : Boolean(localChips[c.type]);
        const count = c.weighted ? counts[c.type as ReactionType] : 0;
        const onClick = c.weighted
          ? () => toggleServer(c.type as ReactionType)
          : () => toggleLocal(c.type as "fire" | "target");
        const disabled = busy === c.type;
        return (
          <button
            key={c.type}
            type="button"
            className={`ireact ${isOn ? "on" : ""}`}
            aria-pressed={isOn}
            disabled={disabled}
            onClick={onClick}
          >
            <span className="ireact-emoji" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="ireact-label">{c.label}</span>
            {c.weighted && count > 0 ? (
              <span className="ireact-count">{count}</span>
            ) : null}
          </button>
        );
      })}
      {errorMsg ? (
        <span className="ireact-msg" role="status" aria-live="polite">
          {errorMsg}
        </span>
      ) : null}
    </div>
  );
}

export { REACTION_TYPES };
