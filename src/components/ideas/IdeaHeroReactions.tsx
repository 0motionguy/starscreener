"use client";

// IdeaHeroReactions — 4-button react row for the /ideas/[id] hero. Emits
// the `.react-btn[data-react=...]` markup from mockup ideas-detail.html:
// 1094-1099. Backed by the same /api/reactions endpoint as the existing
// IdeaReactionsRow, but only exposes the four hero-pertinent reactions
// (fire / bulb / rocket / target). Bulb maps to "build", rocket to "use".
// Fire + target are local-only (no DB column).

import { useCallback, useState } from "react";
import type { ReactNode } from "react";

import {
  BulbSvg,
  FlameIcon,
  RocketIcon,
  TargetIcon,
} from "@/components/icons-animated";
import type {
  ReactionCounts,
  ReactionType,
  UserReactionState,
} from "@/lib/reactions-shape";

interface IdeaHeroReactionsProps {
  ideaId: string;
  initialCounts: ReactionCounts;
  initialMine: UserReactionState | null;
  signedIn: boolean;
}

interface HeroChip {
  /** Mockup data-react value. */
  key: "fire" | "bulb" | "rocket" | "target";
  render: () => ReactNode;
  /** Persisted reaction column, if any. Fire/target are local-only. */
  serverType: ReactionType | null;
}

const CHIPS: HeroChip[] = [
  {
    key: "fire",
    render: () => <FlameIcon size={14} color="currentColor" />,
    serverType: null,
  },
  {
    key: "bulb",
    render: () => <BulbSvg size={14} color="var(--accent)" />,
    serverType: "build",
  },
  {
    key: "rocket",
    render: () => <RocketIcon size={14} color="currentColor" />,
    serverType: "use",
  },
  {
    key: "target",
    render: () => <TargetIcon size={14} color="currentColor" />,
    serverType: null,
  },
];

export function IdeaHeroReactions({
  ideaId,
  initialCounts,
  initialMine,
  signedIn,
}: IdeaHeroReactionsProps) {
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  const [mine, setMine] = useState<UserReactionState>(
    initialMine ?? { build: false, use: false, buy: false, invest: false },
  );
  const [localOn, setLocalOn] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(`idea-hero-expr:${ideaId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleServer = useCallback(
    async (rt: ReactionType) => {
      if (!signedIn) {
        setErrorMsg("Sign in to react");
        return;
      }
      const wasOn = mine[rt];
      // Optimistic
      setCounts((c) => ({ ...c, [rt]: Math.max(0, c[rt] + (wasOn ? -1 : 1)) }));
      setMine((m) => ({ ...m, [rt]: !wasOn }));
      setErrorMsg(null);
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
      }
    },
    [ideaId, mine, signedIn],
  );

  const toggleLocal = useCallback(
    (key: "fire" | "target") => {
      setLocalOn((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          window.localStorage.setItem(
            `idea-hero-expr:${ideaId}`,
            JSON.stringify(next),
          );
        } catch {
          /* quota — ignore */
        }
        return next;
      });
    },
    [ideaId],
  );

  return (
    <div className="quick-react" data-react-row role="group" aria-label="React to idea">
      {CHIPS.map((chip) => {
        const isOn = chip.serverType
          ? mine[chip.serverType]
          : Boolean(localOn[chip.key]);
        const count = chip.serverType ? counts[chip.serverType] : 0;
        const onClick = chip.serverType
          ? () => toggleServer(chip.serverType as ReactionType)
          : () => toggleLocal(chip.key as "fire" | "target");
        return (
          <button
            key={chip.key}
            type="button"
            className={`react-btn ${isOn ? "on" : ""}`}
            data-react={chip.key}
            aria-pressed={isOn}
            onClick={onClick}
          >
            <span className="emoji" aria-hidden="true">
              {chip.render()}
            </span>
            {chip.serverType ? <span className="n">{count}</span> : null}
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
