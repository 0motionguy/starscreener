"use client";

// IdeaContributionComposer — the 8-type chip row + composer body of the
// /ideas/[id] Contributions tab. Pixel-faithful to ideas-detail.html:
// 1172-1193.
//
// On submit, POSTs to /api/ideas/[id]/contributions with { type, body,
// mentionsRepos, mentionsSkills }. The 8 UI chip ids (sample
// CONTRIBUTION_TYPE_LABEL keys) map to the 8 backend ContributionType
// strings — most are identical, except "i-would-use" → "would-use" and
// "i-would-build" → "would-build" (backend type names are stripped of
// the "i-" prefix).

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  CONTRIBUTION_TYPE_LABEL,
  type ContributionType as UiContributionType,
} from "@/lib/ideas/sample-contributions";
import { Icon, Wrench, Hammer } from "@/lib/icons";
import {
  MessageCircleIcon,
  MagnifierIcon,
  GithubIcon,
  RocketIcon,
  EyeIcon,
} from "@/components/icons-animated";

import { AtMentionMenu, type MentionItem } from "./AtMentionMenu";

interface IdeaContributionComposerProps {
  ideaId: string;
  signedIn: boolean;
}

const CHIP_EMOJI: Record<UiContributionType, ReactNode> = {
  comment: <MessageCircleIcon size={14} color="currentColor" />,
  evidence: <MagnifierIcon size={14} color="currentColor" />,
  repo: <GithubIcon size={14} color="currentColor" />,
  feature: <Icon name="zap" size="md" style={{ color: "var(--accent)" }} />,
  workaround: <Wrench size={14} strokeWidth={2} color="currentColor" />,
  project: <RocketIcon size={14} color="currentColor" />,
  "i-would-use": <EyeIcon size={14} color="currentColor" />,
  "i-would-build": <Hammer size={14} strokeWidth={2} color="currentColor" />,
};

const CHIPS: UiContributionType[] = [
  "comment",
  "evidence",
  "repo",
  "feature",
  "workaround",
  "project",
  "i-would-use",
  "i-would-build",
];

/** Map a UI chip id to the backend contribution type. */
function backendType(ui: UiContributionType): string {
  if (ui === "i-would-use") return "would-use";
  if (ui === "i-would-build") return "would-build";
  return ui;
}

/** Pull repo + skill mentions out of the body so the backend can index them. */
function extractMentions(body: string): {
  mentionsRepos: string[];
  mentionsSkills: string[];
} {
  const repos: string[] = [];
  const skills: string[] = [];
  // Repo mentions: @owner/name (allowed chars [\w.-])
  const repoRe = /@([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g;
  for (let m: RegExpExecArray | null; (m = repoRe.exec(body)); ) {
    if (m[1] && !repos.includes(m[1])) repos.push(m[1]);
  }
  // Skill mentions: @word (no slash). Skip ones already captured as repos.
  const skillRe = /@([A-Za-z][A-Za-z0-9_-]*)\b(?!\/)/g;
  for (let m: RegExpExecArray | null; (m = skillRe.exec(body)); ) {
    if (!m[1]) continue;
    const tok = m[1].toLowerCase();
    if (!skills.includes(tok) && !repos.some((r) => r.startsWith(`${m![1]}/`))) {
      skills.push(tok);
    }
  }
  return { mentionsRepos: repos, mentionsSkills: skills };
}

export function IdeaContributionComposer({
  ideaId,
  signedIn,
}: IdeaContributionComposerProps) {
  const [type, setType] = useState<UiContributionType>("comment");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDraft(v);
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const m = before.match(/@([\w/-]*)$/);
    if (m) {
      setMenuOpen(true);
      setMenuQuery(m[1] ?? "");
    } else {
      setMenuOpen(false);
    }
  }, []);

  const onPickMention = useCallback((item: MentionItem) => {
    const el = inputRef.current;
    if (!el) return;
    const v = el.value;
    const cursor = el.selectionStart ?? v.length;
    const label = item.type === "skill" ? item.label.replace(/^@/, "") : item.label;
    const before = v.slice(0, cursor).replace(/@([\w/-]*)$/, `@${label} `);
    const after = v.slice(cursor);
    const next = before + after;
    setDraft(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }, []);

  const onSubmit = useCallback(async () => {
    if (!signedIn) {
      setMsg("Sign in to contribute");
      return;
    }
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setMsg(null);
    const { mentionsRepos, mentionsSkills } = extractMentions(body);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/contributions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: backendType(type),
          body,
          mentionsRepos,
          mentionsSkills,
        }),
      });
      if (res.ok) {
        setMsg("Posted");
        setDraft("");
      } else if (res.status === 401) {
        setMsg("Sign in to contribute");
      } else if (res.status === 429) {
        setMsg("Slow down — too many posts");
      } else {
        setMsg("Could not post — try again");
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }, [draft, ideaId, signedIn, type]);

  return (
    <div className="contribution-composer">
      <div
        className="contribution-options option-chip-row"
        role="tablist"
        aria-label="Contribution type"
      >
        {CHIPS.map((id) => (
          <button
            key={id}
            type="button"
            className={`option-chip ${id === type ? "active" : ""}`}
            data-type={id}
            role="tab"
            aria-selected={id === type}
            onClick={() => setType(id)}
          >
            <span aria-hidden="true">{CHIP_EMOJI[id]}</span>{" "}
            {CONTRIBUTION_TYPE_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="composer-wrap">
        <div className="composer-row">
          <div className="you-avatar" aria-hidden="true">
            YOU
          </div>
          <textarea
            ref={inputRef}
            className="field"
            placeholder="Share a thought, evidence, or repo... type @ to tag a repo or skill"
            value={draft}
            onChange={onChange}
            rows={2}
            aria-label="Contribution draft"
          />
          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.trim()}
            onClick={onSubmit}
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
        <AtMentionMenu
          query={menuQuery}
          open={menuOpen}
          onPick={onPickMention}
          onClose={() => setMenuOpen(false)}
          anchorRef={inputRef}
        />
        {msg ? (
          <p className="action-msg" role="status" aria-live="polite">
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
