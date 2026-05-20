"use client";

import { useCallback, useRef, useState } from "react";

import {
  CONTRIBUTION_TYPE_LABEL,
  SAMPLE_CONTRIBUTIONS,
  type ContributionType,
  type SampleContribution,
} from "@/lib/ideas/sample-contributions";

import { AtMentionMenu, type MentionItem } from "./AtMentionMenu";

interface IdeaContributionsTabProps {
  ideaId: string;
  signedIn: boolean;
}

const TYPES: ContributionType[] = [
  "comment",
  "evidence",
  "repo",
  "feature",
  "workaround",
  "project",
  "i-would-use",
  "i-would-build",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ReactionButton({ label, count }: { label: string; count: number }) {
  const [value, setValue] = useState(count);
  return (
    <button
      type="button"
      className="react-btn"
      aria-label={label}
      onClick={() => setValue((v) => v + 1)}
    >
      <span className="emoji" aria-hidden="true">
        {label}
      </span>
      <span className="n">{value}</span>
    </button>
  );
}

function ContributionCard({ item }: { item: SampleContribution }) {
  return (
    <article className="contribution-card">
      <div className={`contribution-avatar b${item.avatarTone}`}>
        {initials(item.authorName)}
      </div>
      <div className="contribution-body">
        <div className="contribution-header">
          <span className="who">{item.authorName}</span>
          <span className="badge">{CONTRIBUTION_TYPE_LABEL[item.type]}</span>
          <span>
            {item.authorHandle} / {item.timeAgoLabel}
          </span>
        </div>
        <p className="contribution-text-body">{item.body}</p>
        <div className="reactions">
          {Object.entries(item.reactions).map(([label, count]) => (
            <ReactionButton key={label} label={label} count={count ?? 0} />
          ))}
        </div>
        <div className="contribution-actions">
          <button type="button" className="small-btn">
            Add to evidence
          </button>
          <button type="button" className="small-btn">
            Reply
          </button>
          <button type="button" className="small-btn">
            Verify
          </button>
        </div>
      </div>
    </article>
  );
}

export function IdeaContributionsTab({
  ideaId,
  signedIn,
}: IdeaContributionsTabProps) {
  const [active, setActive] = useState<ContributionType>("comment");
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<SampleContribution[]>(SAMPLE_CONTRIBUTIONS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);
    const cursor = e.target.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/@([\w/-]*)$/);
    if (match) {
      setMenuOpen(true);
      setMenuQuery(match[1] ?? "");
    } else {
      setMenuOpen(false);
    }
  }, []);

  const onPickMention = useCallback((item: MentionItem) => {
    const el = inputRef.current;
    if (!el) return;
    const value = el.value;
    const cursor = el.selectionStart ?? value.length;
    const before = value
      .slice(0, cursor)
      .replace(/@([\w/-]*)$/, `@${item.label} `);
    const next = before + value.slice(cursor);
    setDraft(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }, []);

  const post = useCallback(() => {
    if (!draft.trim()) return;
    setItems((prev) => [
      {
        id: `${ideaId}-local-${Date.now()}`,
        authorName: signedIn ? "You" : "Guest builder",
        authorHandle: signedIn ? "@you" : "@guest",
        avatarTone: 1,
        type: active,
        body: draft.trim(),
        reactions: { bulb: 0, fire: 0 },
        timeAgoLabel: "just now",
      },
      ...prev,
    ]);
    setDraft("");
  }, [active, draft, ideaId, signedIn]);

  return (
    <section className="tab-pane tab-contributions">
      <div className="section-block">
        <div className="section-title">
          <h2>Contribute to this idea</h2>
          <span>type @ to tag a repo or skill</span>
        </div>
        <div className="contribution-composer">
          <div className="contribution-options" aria-label="Contribution type">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`option-chip ${type === active ? "active" : ""}`}
                onClick={() => setActive(type)}
              >
                {CONTRIBUTION_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          <div className="composer-row">
            <div className="you-avatar" aria-hidden="true">
              YOU
            </div>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={onChange}
              placeholder="Share a thought, evidence, or repo... type @ to tag"
              aria-label="Contribution body"
            />
            <button type="button" className="btn primary" onClick={post}>
              Post
            </button>
            <AtMentionMenu
              query={menuQuery}
              open={menuOpen}
              onPick={onPickMention}
              onClose={() => setMenuOpen(false)}
              anchorRef={inputRef}
            />
          </div>
        </div>
      </div>

      <div className="section-block">
        <div className="section-title">
          <h2>Comments and contributions</h2>
          <span>{items.length} contributions</span>
        </div>
        <div className="contribution-feed">
          {items.map((item) => (
            <ContributionCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
