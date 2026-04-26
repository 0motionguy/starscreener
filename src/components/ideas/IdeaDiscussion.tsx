"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ImageIcon, MessageSquare, Paperclip, Send, ThumbsUp } from "lucide-react";

import type { PublicIdea } from "@/lib/ideas";
import type { ReactionCounts } from "@/lib/reactions-shape";
import { cn } from "@/lib/utils";

interface IdeaDiscussionProps {
  idea: PublicIdea;
  reactionCounts: ReactionCounts;
  compact?: boolean;
}

export function IdeaDiscussion({
  idea,
  reactionCounts,
  compact = false,
}: IdeaDiscussionProps) {
  const [expanded, setExpanded] = useState(!compact);
  const comments = useMemo(
    () => buildComments(idea, reactionCounts),
    [idea, reactionCounts],
  );
  const visible = expanded ? comments : comments.slice(0, 2);

  return (
    <div className="border-t border-white/6 bg-black/15 px-3 py-3">
      <div className="space-y-1">
        {visible.map((comment) => (
          <CommentItem key={`${comment.by}-${comment.text}`} comment={comment} />
        ))}
      </div>

      {compact && comments.length > visible.length ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 px-3 text-[11px] text-text-tertiary transition hover:text-text-primary"
        >
          Show {comments.length - visible.length} more notes
        </button>
      ) : null}

      <CommentComposer compact={compact} />
    </div>
  );
}

function CommentItem({ comment }: { comment: IdeaComment }) {
  return (
    <div className="flex gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.025]">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 font-mono text-[9px] font-bold text-text-primary">
        {comment.by.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-white">@{comment.by}</span>
          <span className="font-mono text-[10px] text-text-muted">{comment.at}</span>
          <span className="font-mono text-[10px] text-text-muted">{comment.kind}</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          {comment.text}
        </p>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-text-tertiary">
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-text-primary">
            <ThumbsUp className="size-3" aria-hidden />
            {comment.likes}
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-text-primary">
            <MessageSquare className="size-3" aria-hidden />
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentComposer({ compact }: { compact: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-white/8 bg-white/[0.025]">
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 font-mono text-[9px] font-bold">
          TR
        </span>
        <textarea
          rows={compact ? 1 : 2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Co-sign, push back, or attach a spec..."
          className="min-h-7 flex-1 resize-none border-0 bg-transparent p-0 text-[12.5px] leading-relaxed text-text-secondary placeholder:text-text-tertiary focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1 border-t border-white/6 px-3 py-2">
        <ComposerTool icon={<Paperclip className="size-3" aria-hidden />} label="Attach" />
        <ComposerTool icon={<ImageIcon className="size-3" aria-hidden />} label="Image" />
        <span className="mx-2 h-4 w-px bg-white/8" aria-hidden />
        <span className="rounded border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-text-tertiary">
          Co-sign
        </span>
        <div className="flex-1" />
        <span className="hidden font-mono text-[10px] text-text-muted sm:inline">
          {value.length} chars
        </span>
        <button
          type="button"
          disabled={!value.trim()}
          onClick={() => setValue("")}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-3 text-[11.5px] font-semibold transition",
            value.trim()
              ? "border-white bg-white text-black"
              : "cursor-not-allowed border-white/10 bg-white/8 text-text-muted",
          )}
        >
          <Send className="size-3" aria-hidden />
          Send
        </button>
      </div>
    </div>
  );
}

function ComposerTool({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md border border-white/8 text-text-tertiary transition hover:border-white/18 hover:text-text-primary"
    >
      {icon}
    </button>
  );
}

interface IdeaComment {
  by: string;
  at: string;
  kind: string;
  text: string;
  likes: number;
}

function buildComments(
  idea: PublicIdea,
  reactionCounts: ReactionCounts,
): IdeaComment[] {
  const tags = idea.tags.length > 0 ? idea.tags.join(", ") : "signal and builder intent";
  return [
    {
      by: idea.authorHandle,
      at: "lead",
      kind: "proposal",
      text: `Looking for the smallest prototype that proves this deserves a real build. First pass should validate ${tags}.`,
      likes: Math.max(1, reactionCounts.build),
    },
    {
      by: "builder",
      at: "now",
      kind: "counter",
      text: `This needs one crisp demo path. I would start with ${idea.targetRepos[0] ?? "a known breakout repo"} and show the before/after in under 60 seconds.`,
      likes: Math.max(2, reactionCounts.use),
    },
    {
      by: "operator",
      at: "soon",
      kind: "scope",
      text: "Good idea, but ship the narrow wedge first: one workflow, one metric, one public artifact people can react to.",
      likes: Math.max(0, reactionCounts.buy + reactionCounts.invest),
    },
  ];
}

export default IdeaDiscussion;
