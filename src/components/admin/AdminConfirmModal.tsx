"use client";

import { useEffect, useRef } from "react";

interface AdminConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

export default function AdminConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: AdminConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 p-4" data-testid="admin-confirm-modal">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-body"
        className="mx-auto mt-[10vh] w-full max-w-md rounded-md border border-down/60 bg-bg-primary p-4 shadow-xl"
      >
        <h3
          id="admin-confirm-title"
          className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary"
        >
          {title}
        </h3>
        <p id="admin-confirm-body" className="mt-2 text-sm text-text-secondary">
          {body}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md border border-down/60 bg-down/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--v4-red)] hover:bg-down/20 disabled:opacity-50"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
