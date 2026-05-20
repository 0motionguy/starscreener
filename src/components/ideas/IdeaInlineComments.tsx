"use client";

import { useCallback, useRef, useState } from "react";

import { AtMentionMenu, type MentionItem } from "./AtMentionMenu";

interface IdeaInlineCommentsProps {
  ideaId: string;
}

interface LocalComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

function seededComments(ideaId: string): LocalComment[] {
  const seed = [...ideaId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const authors = ["Mira S.", "OpsKit", "Jordan R.", "infra-lens", "Avery K."];
  const bodies = [
    "Setup visibility and first-run health are the repeated asks in the related issues.",
    "The MVP should stay narrow: one repo, one setup checklist, one shareable health page.",
    "I would use this for client handoff. A hosted status page beats another local script.",
  ];
  return bodies.map((body, index) => ({
    id: `seed-${ideaId}-${index}`,
    author: authors[(seed + index) % authors.length]!,
    body,
    createdAt: `${index + 1}h`,
  }));
}

export function IdeaInlineComments({ ideaId }: IdeaInlineCommentsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<LocalComment[]>(() =>
    seededComments(ideaId),
  );
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
    const before = v
      .slice(0, cursor)
      .replace(/@([\w/-]*)$/, `@${item.label} `);
    const after = v.slice(cursor);
    const next = before + after;
    setDraft(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }, []);

  const onSubmit = useCallback(() => {
    if (!draft.trim()) return;
    setComments((prev) => [
      {
        id: `local-${Date.now()}`,
        author: "You",
        body: draft.trim(),
        createdAt: "just now",
      },
      ...prev,
    ]);
    setDraft("");
  }, [draft]);

  return (
    <div className={`row-comments ${open ? "open" : ""}`} data-idea-id={ideaId}>
      <button
        type="button"
        className="row-comments-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide thread" : "Discuss"}
        <span className="cmt-count">{comments.length}</span>
        <span className="cmt-hint">@ to tag repo or skill</span>
      </button>
      {open ? (
        <div className="row-comments-body">
          <ul className="row-comment-list">
            {comments.map((c) => (
              <li key={c.id} className="row-comment">
                <span className="row-comment-avatar">
                  {c.author
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="row-comment-body">{c.body}</span>
                <span className="row-comment-meta">
                  {c.author} / {c.createdAt}
                </span>
              </li>
            ))}
          </ul>
          <div className="row-composer">
            <textarea
              ref={inputRef}
              className="row-composer-input"
              placeholder="Reply with @repo or @skill mentions..."
              value={draft}
              onChange={onChange}
              rows={2}
              aria-label="Comment draft"
            />
            <AtMentionMenu
              query={menuQuery}
              open={menuOpen}
              onPick={onPickMention}
              onClose={() => setMenuOpen(false)}
              anchorRef={inputRef}
            />
            <div className="row-composer-actions">
              <span className="row-composer-hint">Adds to this thread</span>
              <button
                type="button"
                className="row-composer-post"
                disabled={!draft.trim()}
                onClick={onSubmit}
              >
                Post
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
