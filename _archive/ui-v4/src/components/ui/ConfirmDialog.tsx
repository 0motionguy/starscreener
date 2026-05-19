"use client";

// AGN-611 — Reusable confirmation modal for destructive admin actions.
// Uses the native <dialog> element so it composes with Tailwind / our
// existing styles without pulling in Radix or Headless UI. Trap and
// restore focus, lock background scroll, and surface ESC to cancel.

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ConfirmDialogTone = "danger" | "warning" | "neutral";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Open / close the underlying <dialog> in lockstep with the `open` prop.
  // showModal() takes over focus and renders a backdrop ::backdrop pseudo
  // element. close() releases both.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Focus the confirm button so keyboard users can act, but it's the
      // destructive option — the cancel button is to its left for safer
      // tab order.
      requestAnimationFrame(() => {
        confirmButtonRef.current?.focus();
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Native <dialog> emits "cancel" on ESC. Surface it to the caller so the
  // parent can flip its open flag.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (busy) return;
      onCancel();
    },
    [busy, onCancel],
  );

  // Backdrop click → cancel. The backdrop is the <dialog> itself when the
  // click target equals the dialog node (children are inside a wrapper div).
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (busy) return;
      if (event.target === dialogRef.current) {
        onCancel();
      }
    },
    [busy, onCancel],
  );

  const confirmTone =
    tone === "danger"
      ? "border-down/60 bg-down/10 text-[var(--v4-red)] hover:bg-down/20"
      : tone === "warning"
        ? "border-[var(--v4-amber)]/60 bg-[var(--v4-amber)]/10 text-[var(--v4-amber)] hover:bg-[var(--v4-amber)]/20"
        : "border-border-primary bg-bg-muted text-text-primary hover:bg-bg-card-hover";

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-description" : undefined}
      className={cn(
        "rounded-card border border-border-primary bg-bg-card text-text-primary shadow-xl",
        "p-0 m-auto max-w-md w-[min(92vw,28rem)]",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
      )}
    >
      <div className="px-5 py-4">
        <h2
          id="confirm-dialog-title"
          className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary"
        >
          {title}
        </h2>
        {description ? (
          <div
            id="confirm-dialog-description"
            className="mt-2 text-sm text-text-secondary"
          >
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-text-primary hover:bg-bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50",
              confirmTone,
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmDialog;
