// DOM helpers for the Autopilot executor. Client-only (touches window/document).
// Deliberately independent of AskDock's private copies so the deployed HUD is
// never destabilised by autopilot work — a few lines of overlap are cheaper
// than refactoring a live component.

export const waitMs = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Set an input's value the React-safe way: use the native value setter (so
 * React's synthetic tracker sees the change) then dispatch input+change.
 */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto = Object.getPrototypeOf(el) as { value?: string };
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Poll for the first element matching `selector`, up to `timeoutMs`. */
export async function waitForElement(
  selector: string,
  timeoutMs = 4000,
): Promise<HTMLElement | null> {
  const start = performance.now();
  for (;;) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    if (performance.now() - start >= timeoutMs) return null;
    await waitMs(120);
  }
}

/** Center an element in the viewport and return its rect after settling. */
export async function scrollToCenter(el: HTMLElement): Promise<DOMRect> {
  el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  await waitMs(prefersReducedMotion() ? 0 : 380);
  return el.getBoundingClientRect();
}

/**
 * Append a floating tag next to an element (reuses the `.ask-agent-mark`
 * style already shipped in ask-agent.css). Cleared by `clearMarks`.
 */
export function markLabel(el: HTMLElement, label: string): void {
  const tag = document.createElement("span");
  tag.className = "ask-agent-mark";
  tag.textContent = label;
  const rect = el.getBoundingClientRect();
  tag.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
  tag.style.top = `${Math.max(8, rect.top + window.scrollY - 28)}px`;
  document.body.appendChild(tag);
  el.classList.add("ask-agent-hot");
}

export function clearMarks(): void {
  document.querySelectorAll(".ask-agent-mark").forEach((el) => el.remove());
  document
    .querySelectorAll(".ask-agent-hot")
    .forEach((el) => el.classList.remove("ask-agent-hot"));
}
