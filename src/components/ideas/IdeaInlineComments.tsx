"use client";

// IdeaInlineComments — collapsible thread block under each idea row.
//
// Contributions backend doesn't exist yet (Phase 4C). For v1 we render
// the composer (with @mention autocomplete) and an empty-state message
// explaining the surface. Comments typed here stay in local component
// state only until the persisted contributions endpoint ships.

import { useCallback, useRef, useState } from "react";

import { AtMentionMenu, type MentionItem } from "./AtMentionMenu";

interface IdeaInlineCommentsProps {
  ideaId: string;
}

interface LocalComment {
  id: string;
  body: string;
  createdAt: string;
}

export function IdeaInlineComments({ ideaId }: IdeaInlineCommentsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDraft(v);
    // Detect "@..." right before the caret.
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

  const onPickMention = useCallback(
    (item: MentionItem) => {
      const el = inputRef.current;
      if (!el) return;
      const v = el.value;
      const cursor = el.selectionStart ?? v.length;
      const before = v.slice(0, cursor).replace(/@([\w/-]*)$/, `@${item.label} `);
      const after = v.slice(cursor);
      const next = before + after;
      setDraft(next);
      setMenuOpen(false);
      // Restore focus + caret after state flush.
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = before.length;
      });
    },
    [],
  );

  const onSubmit = useCallback(() => {
    if (!draft.trim()) return;
    // No backend yet — Phase 4C contributions endpoint will own this.
    setComments((prev) => [
      {
        id: `local-${Date.now()}`,
        body: draft.trim(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft("");
  }, [draft]);

  return (
    <div className={`row-comments ${open ? "open" : ""}`}>
      <button
        type="button"
        className="row-comments-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide thread" : "Discuss"}
        <span className="cmt-count">{comments.length}</span>
      </button>
      {open ? (
        <div className="row-comments-body">
          {comments.length === 0 ? (
            <div className="row-empty">
              <p>
                Comments are not syncing yet for{" "}
                <code>/api/ideas/{ideaId}/contributions</code>.
              </p>
              <p style={{ color: "var(--fg-faint)", fontSize: 12 }}>
                You can still draft below. Your text stays in this tab for now.
              </p>
            </div>
          ) : (
            <ul className="row-comment-list">
              {comments.map((c) => (
                <li key={c.id} className="row-comment">
                  <span className="row-comment-body">{c.body}</span>
                  <span className="row-comment-meta">draft · local</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row-composer">
            <textarea
              ref={inputRef}
              className="row-composer-input"
              placeholder="Reply with @repo or @skill mentions…"
              value={draft}
              onChange={onChange}
              rows={2}
            />
            <AtMentionMenu
              query={menuQuery}
              open={menuOpen}
              onPick={onPickMention}
              onClose={() => setMenuOpen(false)}
              anchorRef={inputRef}
            />
            <div className="row-composer-actions">
              <span className="row-composer-hint">
                Local draft only
              </span>
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
