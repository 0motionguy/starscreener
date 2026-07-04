import type { AgentRisk, PageDomMap, PageOperatorControl, PageOperatorRepoCard } from "./types";

const CONTROL_SELECTOR = [
  "[data-agent-id]",
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
].join(",");

const SECRET_RE = /(secret|token|key|password|cookie|csrf|session)/i;
const SENSITIVE_INPUT_TYPES = new Set(["hidden", "password", "file"]);

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function isSensitive(el: Element): boolean {
  const input = el as HTMLInputElement;
  const type = input.type?.toLowerCase();
  const name = [input.name, input.id, input.getAttribute("data-agent-id")].filter(Boolean).join(" ");
  return Boolean((type && SENSITIVE_INPUT_TYPES.has(type)) || SECRET_RE.test(name));
}

function isVisible(el: Element): boolean {
  if (el.hasAttribute("hidden") || isSensitive(el)) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function controlFrom(el: Element): PageOperatorControl | null {
  if (!isVisible(el)) return null;
  const html = el as HTMLElement;
  const agentId = html.dataset.agentId;
  if (!agentId) return null;
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const href = tag === "a" ? (el as HTMLAnchorElement).getAttribute("href") ?? undefined : undefined;
  const rawValue =
    tag === "input" || tag === "textarea" || tag === "select" ? String(input.value ?? "") : undefined;
  const risk = html.dataset.agentRisk as AgentRisk | undefined;

  return {
    agentId,
    label:
      html.dataset.agentLabel ??
      el.getAttribute("aria-label") ??
      el.getAttribute("title") ??
      el.getAttribute("placeholder") ??
      textOf(el),
    action: html.dataset.agentAction,
    risk,
    tag,
    href,
    value: rawValue ? rawValue.slice(0, 120) : undefined,
  };
}

function repoCardFrom(el: Element): PageOperatorRepoCard | null {
  if (!isVisible(el)) return null;
  const html = el as HTMLElement;
  const agentId = html.dataset.agentId;
  if (!agentId) return null;
  const href = el.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href") ?? undefined;
  return {
    agentId,
    fullName: html.dataset.agentRepoFullName,
    href,
    text: textOf(el),
  };
}

export function captureDomMap(
  doc: Document = document,
  opts: { route?: string } = {},
): PageDomMap {
  const controls = Array.from(doc.querySelectorAll(CONTROL_SELECTOR))
    .map(controlFrom)
    .filter((control): control is PageOperatorControl => Boolean(control))
    .slice(0, 120);

  const repoCards = Array.from(doc.querySelectorAll('[data-agent-role="repo.card"]'))
    .map(repoCardFrom)
    .filter((card): card is PageOperatorRepoCard => Boolean(card))
    .slice(0, 50);

  const freshness = Array.from(doc.querySelectorAll('[data-agent-role="freshness"], .freshness-badge, .freshness-chip'))
    .filter(isVisible)
    .map(textOf)
    .filter(Boolean)
    .slice(0, 10);

  return {
    route: opts.route ?? window.location.pathname,
    title: doc.title,
    headings: Array.from(doc.querySelectorAll("h1,h2"))
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean)
      .slice(0, 20),
    controls,
    repoCards,
    resultsCount: repoCards.length || undefined,
    freshness,
    selectedRepos: controls
      .filter((control) => control.action === "repo.compare" && control.label?.toLowerCase().includes("remove"))
      .map((control) => control.agentId),
  };
}
