"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Bot,
  Boxes,
  Code2,
  FileText,
  ImageIcon,
  Layers,
  Link as LinkIcon,
  LoaderCircle,
  Paperclip,
  Plus,
  Send,
  Tags,
  Users,
  X,
  Zap,
} from "lucide-react";

import type { PublicIdea } from "@/lib/ideas";
import { cn } from "@/lib/utils";

type CreateIdeaApiResponse =
  | {
      ok: true;
      result:
        | { kind: "queued"; idea: PublicIdea }
        | { kind: "published"; idea: PublicIdea }
        | { kind: "duplicate"; idea: PublicIdea };
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: { field: string; message: string }[];
    };

type DropMode = "drop" | "join";
type StackKind = "repos" | "agents" | "skills" | "apis" | "channels";
type AttachmentKind = "image" | "markdown" | "text" | "file";

interface AttachmentDraft {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: string;
  previewUrl?: string;
}

interface IdeaComposerProps {
  onPublished?: (idea: PublicIdea, kind: "queued" | "published" | "duplicate") => void;
}

const STACK_LABELS: Record<StackKind, string> = {
  repos: "Repos",
  agents: "Agents",
  skills: "Skills",
  apis: "APIs",
  channels: "Channels",
};

const STACK_ICONS: Record<StackKind, ReactNode> = {
  repos: <Boxes className="size-3" aria-hidden />,
  agents: <Bot className="size-3" aria-hidden />,
  skills: <Zap className="size-3 text-brand" aria-hidden />,
  apis: <LinkIcon className="size-3" aria-hidden />,
  channels: <Tags className="size-3" aria-hidden />,
};

const SUGGESTIONS: Record<StackKind, string[]> = {
  repos: ["supermemory-ai/mcp-stars", "karpathy/nanochat", "ghostty-org/ghostty"],
  agents: ["Scout", "Architect", "Forge"],
  skills: ["star-momentum", "ranking-v2", "weekly-digest"],
  apis: ["GitHub GraphQL", "MCP runtime", "Bluesky firehose"],
  channels: ["mcp", "github-signal", "social-graph"],
};

export function IdeaComposer({ onPublished }: IdeaComposerProps) {
  const [mode, setMode] = useState<DropMode>("drop");
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [brief, setBrief] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [stack, setStack] = useState<Record<StackKind, string[]>>({
    repos: [],
    agents: [],
    skills: [],
    apis: [],
    channels: [],
  });
  const [draftInputs, setDraftInputs] = useState<Record<StackKind | "tags", string>>({
    repos: "",
    agents: "",
    skills: "",
    apis: "",
    channels: "",
    tags: "",
  });
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMissing, setAuthMissing] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const titleText = title.trim();
  const pitchText = pitch.trim();
  const targetRepos = stack.repos.slice(0, 5);
  const disabled = submitting || titleText.length < 8 || pitchText.length < 20;
  const body = useMemo(
    () =>
      composeIdeaBody({
        brief,
        mode,
        stack,
        attachments,
      }),
    [attachments, brief, mode, stack],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const payloadBody: Record<string, unknown> = {
        title: titleText,
        pitch: pitchText,
        buildStatus: mode === "join" ? "building" : "exploring",
        body: body || null,
      };
      if (targetRepos.length > 0) payloadBody.targetRepos = targetRepos;
      if (tags.length > 0) {
        payloadBody.tags = tags.slice(0, 6);
        payloadBody.category = tags[0];
      }

      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      if (res.status === 401 || res.status === 503) {
        setAuthMissing(true);
        return;
      }
      const payload = (await res.json()) as CreateIdeaApiResponse;
      if (!payload.ok) {
        const detailMsg = payload.details?.map((d) => d.message).join("; ");
        throw new Error(detailMsg || payload.error);
      }
      setTitle("");
      setPitch("");
      setBrief("");
      setTags([]);
      setStack({ repos: [], agents: [], skills: [], apis: [], channels: [] });
      setAttachments([]);
      if (onPublished) {
        onPublished(payload.result.idea, payload.result.kind);
      } else if (
        typeof window !== "undefined" &&
        payload.result.kind === "published"
      ) {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function addTag(raw: string) {
    const value = normalizeChip(raw).replace(/^#/, "");
    if (!value || tags.includes(value) || tags.length >= 6) return;
    setTags((current) => [...current, value]);
    setDraftInputs((current) => ({ ...current, tags: "" }));
  }

  function addStackItem(kind: StackKind, raw: string) {
    const value = normalizeChip(raw);
    if (!value || stack[kind].includes(value)) return;
    if (kind === "repos" && stack.repos.length >= 5) return;
    setStack((current) => ({
      ...current,
      [kind]: [...current[kind], value],
    }));
    setDraftInputs((current) => ({ ...current, [kind]: "" }));
  }

  function removeStackItem(kind: StackKind, value: string) {
    setStack((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item !== value),
    }));
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const item = current.find((attachment) => attachment.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>, preferredKind?: AttachmentKind) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setAttachments((current) => [
      ...current,
      ...files.map((file) => {
        const kind = preferredKind ?? inferAttachmentKind(file);
        return {
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          kind,
          name: file.name,
          size: formatFileSize(file.size),
          previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
        };
      }),
    ]);
    event.target.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-card border border-border-primary bg-bg-card shadow-card"
      data-testid="idea-composer"
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="border-b border-border-secondary p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <ModeButton active={mode === "drop"} onClick={() => setMode("drop")}>
                <Send className="size-3.5" aria-hidden />
                Drop idea
              </ModeButton>
              <ModeButton active={mode === "join"} onClick={() => setMode("join")}>
                <Users className="size-3.5" aria-hidden />
                Join build
              </ModeButton>
              <span className="ml-auto font-mono text-[10px] text-text-muted">
                {titleText.length}/80 / {pitchText.length}/280
              </span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Name the idea like a product, not a note..."
              maxLength={80}
              aria-label="Idea title"
              className="w-full border-0 bg-transparent p-0 text-xl font-bold leading-tight text-text-primary placeholder:text-text-muted focus:outline-none sm:text-2xl"
            />
            <textarea
              value={pitch}
              onChange={(event) => setPitch(event.target.value)}
              placeholder="One sentence: what should exist, who it is for, and why now."
              maxLength={280}
              rows={2}
              aria-label="Idea pitch"
              className="mt-3 min-h-14 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-text-secondary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>

          <section className="border-b border-border-secondary p-4 sm:p-5">
            <SectionTitle
              icon={<Layers className="size-4 text-text-tertiary" aria-hidden />}
              title="Stack"
              subtitle="Repos, agents, skills, APIs, and channels powering this idea"
            />
            <div className="mt-4 rounded-card border border-border-secondary bg-bg-inset/70 p-4">
              {(Object.keys(STACK_LABELS) as StackKind[]).map((kind) => (
                <StackRow
                  key={kind}
                  kind={kind}
                  values={stack[kind]}
                  input={draftInputs[kind]}
                  onInput={(value) =>
                    setDraftInputs((current) => ({ ...current, [kind]: value }))
                  }
                  onAdd={(value) => addStackItem(kind, value)}
                  onRemove={(value) => removeStackItem(kind, value)}
                />
              ))}
            </div>
          </section>

          <section className="grid gap-4 border-b border-border-secondary p-4 sm:p-5 lg:grid-cols-2">
            <div>
              <SectionTitle
                icon={<Tags className="size-4 text-text-tertiary" aria-hidden />}
                title="Tags"
                subtitle="Search and ranking labels"
              />
              <ChipInput
                value={draftInputs.tags}
                placeholder="mcp, agents, signal..."
                onValue={(value) => setDraftInputs((current) => ({ ...current, tags: value }))}
                onAdd={addTag}
                className="mt-3"
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <RemovableChip
                    key={tag}
                    label={`# ${tag}`}
                    onRemove={() => setTags((current) => current.filter((item) => item !== tag))}
                  />
                ))}
                {tags.length === 0
                  ? ["mcp", "agents", "signal", "social"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="rounded-md border border-border-secondary bg-bg-inset px-2 py-1 font-mono text-[11px] text-text-tertiary transition hover:border-border-strong hover:text-text-primary"
                      >
                        # {tag}
                      </button>
                    ))
                  : null}
              </div>
            </div>

            <div>
              <SectionTitle
                icon={<Paperclip className="size-4 text-text-tertiary" aria-hidden />}
                title="Attachments"
                subtitle="Image, text, markdown, or spec files"
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFiles(event, "image")}
              />
              <input
                ref={docInputRef}
                type="file"
                multiple
                accept=".md,.txt,.json,.yaml,.yml,text/plain,text/markdown,application/json"
                className="hidden"
                onChange={(event) => handleFiles(event)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <AttachButton onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="size-3.5" aria-hidden />
                  Image
                </AttachButton>
                <AttachButton onClick={() => docInputRef.current?.click()}>
                  <FileText className="size-3.5" aria-hidden />
                  MD/Text
                </AttachButton>
                <AttachButton onClick={() => docInputRef.current?.click()}>
                  <Code2 className="size-3.5" aria-hidden />
                  Spec
                </AttachButton>
              </div>
              {attachments.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <AttachmentChip
                      key={attachment.id}
                      attachment={attachment}
                      onRemove={() => removeAttachment(attachment.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="p-4 sm:p-5">
            <SectionTitle
              icon={<FileText className="size-4 text-text-tertiary" aria-hidden />}
              title="Build note"
              subtitle="Optional context for builders joining underneath"
            />
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={900}
              rows={4}
              placeholder="What should the first prototype prove? What should builders avoid? What does done look like?"
              className="mt-3 min-h-28 w-full resize-y rounded-card border border-border-secondary bg-bg-inset px-3 py-3 text-sm leading-relaxed text-text-secondary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
            />
          </section>
        </div>

        <aside className="border-t border-border-secondary bg-bg-inset/70 p-4 xl:border-l xl:border-t-0">
          <div className="sticky top-20">
            <SectionTitle
              icon={<Boxes className="size-4 text-text-tertiary" aria-hidden />}
              title="Live preview"
              subtitle="This updates as the idea is created"
            />
            <ComposerPreview
              mode={mode}
              title={titleText}
              pitch={pitchText}
              brief={brief}
              tags={tags}
              stack={stack}
              attachments={attachments}
            />

            {authMissing ? (
              <p className="mt-3 text-[11px] text-warning">
                Sign in to post ideas. Browser auth flow lands next sprint.
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-[11px] text-down" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => setMode("join")}
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-card border text-sm font-semibold transition",
                  mode === "join"
                    ? "border-functional bg-functional text-black"
                    : "border-border-primary bg-bg-card text-text-secondary hover:border-functional/60 hover:text-text-primary",
                )}
              >
                <Users className="size-4" aria-hidden />
                I want to join build
              </button>
              <button
                type="submit"
                disabled={disabled}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-card border border-brand bg-brand px-4 text-sm font-bold text-black transition hover:bg-brand-hover",
                  disabled && "cursor-not-allowed border-border-primary bg-bg-card text-text-muted hover:bg-bg-card",
                )}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : mode === "join" ? (
                  <Users className="size-4" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                {mode === "join" ? "Join build" : "Drop idea"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold transition",
        active
          ? "border-white/20 bg-white/10 text-text-primary"
          : "border-border-secondary bg-bg-inset text-text-tertiary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
      </div>
      <p className="mt-1 text-[12px] text-text-tertiary">{subtitle}</p>
    </div>
  );
}

function StackRow({
  kind,
  values,
  input,
  onInput,
  onAdd,
  onRemove,
}: {
  kind: StackKind;
  values: string[];
  input: string;
  onInput: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 border-b border-border-secondary py-3 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[130px_1fr]">
      <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase text-text-muted">
        {STACK_ICONS[kind]}
        {STACK_LABELS[kind]}
      </div>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <RemovableChip key={value} label={value} onRemove={() => onRemove(value)} />
          ))}
          {values.length === 0
            ? SUGGESTIONS[kind].slice(0, 3).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onAdd(value)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-card px-2 py-1 font-mono text-[11px] font-semibold text-text-tertiary transition hover:border-border-strong hover:text-text-primary"
                >
                  <Plus className="size-3" aria-hidden />
                  {value}
                </button>
              ))
            : null}
        </div>
        <ChipInput
          value={input}
          placeholder={`Add ${STACK_LABELS[kind].toLowerCase()}...`}
          onValue={onInput}
          onAdd={onAdd}
          className="mt-2"
        />
      </div>
    </div>
  );
}

function ChipInput({
  value,
  placeholder,
  onValue,
  onAdd,
  className,
}: {
  value: string;
  placeholder: string;
  onValue: (value: string) => void;
  onAdd: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex overflow-hidden rounded-md border border-border-secondary bg-bg-card", className)}>
      <input
        value={value}
        onChange={(event) => onValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            onAdd(value);
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono text-[12px] text-text-secondary placeholder:text-text-muted focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onAdd(value)}
        className="inline-flex w-9 items-center justify-center border-l border-border-secondary text-text-tertiary transition hover:bg-bg-card-hover hover:text-text-primary"
        aria-label="Add"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function RemovableChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-card px-2 py-1 font-mono text-[11px] font-semibold text-text-secondary">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-text-muted transition hover:text-text-primary"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

function AttachButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border-secondary bg-bg-inset px-3 text-[12px] font-semibold text-text-secondary transition hover:border-border-strong hover:text-text-primary"
    >
      {children}
    </button>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AttachmentDraft;
  onRemove: () => void;
}) {
  const Icon =
    attachment.kind === "image"
      ? ImageIcon
      : attachment.kind === "markdown" || attachment.kind === "text"
        ? FileText
        : Paperclip;
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border-secondary bg-bg-inset px-2 py-1.5 text-[11px] text-text-secondary">
      <Icon className="size-3.5 text-text-tertiary" aria-hidden />
      <span className="max-w-[160px] truncate font-mono">{attachment.name}</span>
      <span className="font-mono text-[10px] text-text-muted">{attachment.size}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-text-muted hover:text-text-primary"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

function ComposerPreview({
  mode,
  title,
  pitch,
  brief,
  tags,
  stack,
  attachments,
}: {
  mode: DropMode;
  title: string;
  pitch: string;
  brief: string;
  tags: string[];
  stack: Record<StackKind, string[]>;
  attachments: AttachmentDraft[];
}) {
  const primaryImage = attachments.find((attachment) => attachment.kind === "image" && attachment.previewUrl);
  return (
    <article className="mt-4 overflow-hidden rounded-card border border-border-primary bg-bg-card shadow-card">
      {primaryImage?.previewUrl ? (
        <div
          className="h-40 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${primaryImage.previewUrl})` }}
          aria-label="Attached image preview"
        />
      ) : (
        <div className="flex h-32 items-center justify-center border-b border-border-secondary bg-bg-primary">
          <div className="grid size-16 place-items-center rounded-2xl border border-border-primary bg-bg-inset">
            <LightbulbMark />
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-md border border-border-secondary bg-bg-inset px-2 py-1 font-mono text-[10px] uppercase text-text-tertiary">
            {mode === "join" ? "Join build" : "Idea drop"}
          </span>
          <span className="font-mono text-[10px] text-functional">
            live preview
          </span>
        </div>
        <h3 className="text-lg font-bold leading-snug text-text-primary">
          {title || "Untitled idea"}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          {pitch || "Pitch appears here while you type."}
        </p>
        <PreviewStack stack={stack} />
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border-secondary bg-bg-inset px-2 py-1 font-mono text-[10px] text-text-tertiary"
              >
                # {tag}
              </span>
            ))}
          </div>
        ) : null}
        {attachments.length > 0 ? (
          <div className="mt-3 rounded-md border border-border-secondary bg-bg-inset p-2">
            <div className="mb-2 font-mono text-[10px] uppercase text-text-muted">
              Attachments
            </div>
            <div className="space-y-1">
              {attachments.slice(0, 4).map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <Paperclip className="size-3 text-text-tertiary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono">{attachment.name}</span>
                  <span className="font-mono text-text-muted">{attachment.size}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {brief.trim() ? (
          <p className="mt-3 line-clamp-4 border-t border-border-secondary pt-3 text-[12px] leading-relaxed text-text-tertiary">
            {brief.trim()}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function PreviewStack({ stack }: { stack: Record<StackKind, string[]> }) {
  const rows = (Object.keys(STACK_LABELS) as StackKind[]).filter((kind) => stack[kind].length > 0);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-border-secondary bg-bg-inset p-2">
      <div className="mb-2 font-mono text-[10px] uppercase text-text-muted">
        Stack
      </div>
      <div className="space-y-1.5">
        {rows.map((kind) => (
          <div key={kind} className="grid grid-cols-[64px_1fr] gap-2">
            <span className="font-mono text-[10px] uppercase text-text-muted">
              {STACK_LABELS[kind]}
            </span>
            <div className="flex flex-wrap gap-1">
              {stack[kind].slice(0, 4).map((value) => (
                <span
                  key={value}
                  className="rounded border border-border-secondary bg-bg-card px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LightbulbMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 text-brand" fill="none" aria-hidden="true">
      <path d="M11 24h10M12 28h8M10 13a6 6 0 1 1 12 0c0 2.6-1.4 4.2-2.8 5.7-.8.9-1.2 1.8-1.2 3.3h-4c0-1.5-.4-2.4-1.2-3.3C11.4 17.2 10 15.6 10 13Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeChip(value: string): string {
  return value.replace(/\s+/g, " ").replace(/,$/, "").trim();
}

function inferAttachmentKind(file: File): AttachmentKind {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (lower.endsWith(".md") || file.type === "text/markdown") return "markdown";
  if (lower.endsWith(".txt") || file.type.startsWith("text/")) return "text";
  return "file";
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function composeIdeaBody({
  brief,
  mode,
  stack,
  attachments,
}: {
  brief: string;
  mode: DropMode;
  stack: Record<StackKind, string[]>;
  attachments: AttachmentDraft[];
}): string {
  const sections: string[] = [`Intent: ${mode === "join" ? "Join build" : "Idea drop"}`];
  const cleanBrief = brief.trim();
  if (cleanBrief) sections.push(`Build note:\n${cleanBrief}`);
  const stackLines = (Object.keys(STACK_LABELS) as StackKind[])
    .filter((kind) => stack[kind].length > 0)
    .map((kind) => `- ${STACK_LABELS[kind]}: ${stack[kind].join(", ")}`);
  if (stackLines.length > 0) sections.push(`Stack:\n${stackLines.join("\n")}`);
  if (attachments.length > 0) {
    sections.push(
      `Attachments:\n${attachments
        .map((attachment) => `- ${attachment.kind}: ${attachment.name} (${attachment.size})`)
        .join("\n")}`,
    );
  }
  return sections.join("\n\n").slice(0, 1900);
}

export default IdeaComposer;
