"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Mic, MicOff, Play, Square } from "lucide-react";

import { captureDomMap } from "@/lib/page-operator/dom-map";
import type { PageOperatorAction, PageOperatorPlan } from "@/lib/page-operator/types";

type SpeechCtor = new () => SpeechLike;
type SpeechLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const DEMO_COMMAND = "Find browser agents like PageAgent and compare the top three.";

function agentSelector(id: string): string {
  return `[data-agent-id="${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function routeMatches(href: string): boolean {
  const next = new URL(href, window.location.origin);
  return window.location.pathname === next.pathname && window.location.search === next.search;
}

async function waitForRoute(href: string): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    if (routeMatches(href)) return;
    await sleep(100);
  }
}

function visible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function speechCtor(): SpeechCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function repoNameNear(el: Element | null): string | null {
  const card = el?.closest<HTMLElement>('[data-agent-role="repo.card"]');
  return card?.dataset.agentRepoFullName ?? card?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? null;
}

function setTextValue(el: Element, text: string): void {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function findAgentTarget(id: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 20; i += 1) {
    const el = document.querySelector<HTMLElement>(agentSelector(id));
    if (el && visible(el)) return el;
    await sleep(350);
  }
  return null;
}

function buildBrief(repos: string[]): string {
  if (repos.length === 0) {
    return [
      "Browser-agent trend brief",
      "1. Compared the top visible browser automation results available in the current TrendingRepo index.",
      "2. Why it is trending: the query clusters around AI browser control, DOM automation, Playwright/CDP harnesses, and agent execution surfaces.",
      "3. MCP / llms.txt / agent-readable docs: not asserted from the page alone; use Toolbox scan to verify each selected repo.",
      "4. AISO / Toolbox / NEO / Maze fit: useful candidates for UI operation, repo readiness scans, and agent-readable workflow research.",
    ].join("\n");
  }
  return repos
    .slice(0, 3)
    .map(
      (repo, index) =>
        `${index + 1}. ${repo}: browser-agent candidate selected for comparison. MCP, llms.txt, and agent-readable docs should be verified through Toolbox before acting on it for AISO, Toolbox, NEO, or Maze.`,
    )
    .join("\n");
}

export function PageOperatorPanel() {
  const router = useRouter();
  const [command, setCommand] = useState(DEMO_COMMAND);
  const [running, setRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("ready");
  const [plan, setPlan] = useState<PageOperatorPlan | null>(null);
  const [brief, setBrief] = useState("");
  const abortRef = useRef(false);
  const selectedReposRef = useRef<string[]>([]);
  const speechRef = useRef<SpeechLike | null>(null);

  const executeStep = useCallback(
    async (step: PageOperatorAction) => {
      setStatus(step.type);
      if (step.type === "navigate") {
        if (!step.href.startsWith("/")) throw new Error("Blocked cross-origin navigation");
        router.push(step.href);
        await waitForRoute(step.href);
        await sleep(300);
        return;
      }
      if (step.type === "wait") {
        await sleep(Math.min(step.ms, 8000));
        return;
      }
      if (step.type === "click") {
        const el = await findAgentTarget(step.target);
        if (!el) {
          setStatus(`missing ${step.target}`);
          return;
        }
        const name = repoNameNear(el);
        if (name && step.target.endsWith(".compare") && !selectedReposRef.current.includes(name)) {
          selectedReposRef.current.push(name);
        }
        el.click();
        await sleep(250);
        return;
      }
      if (step.type === "type") {
        const el = await findAgentTarget(step.target);
        if (el) setTextValue(el, step.text);
        return;
      }
      if (step.type === "select") {
        const el = await findAgentTarget(step.target);
        if (el instanceof HTMLSelectElement) {
          el.value = step.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      if (step.type === "scroll") {
        window.scrollBy({ top: step.direction === "down" ? 480 : -480, behavior: "smooth" });
        await sleep(300);
        return;
      }
      if (step.type === "askConfirmation") {
        if (!window.confirm(step.summary)) throw new Error("Confirmation declined");
        return;
      }
      if (step.type === "done") {
        setBrief(buildBrief(selectedReposRef.current));
        setStatus(step.summary);
      }
    },
    [router],
  );

  const run = useCallback(async () => {
    if (!command.trim()) return;
    setRunning(true);
    setBrief("");
    setPlan(null);
    selectedReposRef.current = [];
    abortRef.current = false;
    try {
      const dom = captureDomMap(document, {
        route: `${window.location.pathname}${window.location.search}`,
      });
      const res = await fetch("/api/internal/page-operator/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: "trendingrepo",
          command,
          route: dom.route,
          dom,
        }),
      });
      if (!res.ok) throw new Error(`planner ${res.status}`);
      const nextPlan = (await res.json()) as PageOperatorPlan;
      setPlan(nextPlan);
      if (nextPlan.risk === "blocked") {
        setStatus(nextPlan.summary);
        return;
      }
      for (const step of nextPlan.steps) {
        if (abortRef.current) {
          setStatus("cancelled");
          break;
        }
        await executeStep(step);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [command, executeStep]);

  const stop = useCallback(() => {
    abortRef.current = true;
    speechRef.current?.abort();
    setListening(false);
    setRunning(false);
    setStatus("cancelled");
  }, []);

  const startVoice = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) {
      setStatus("voice unavailable");
      return;
    }
    const recognition = new Ctor();
    speechRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1]?.[0]?.transcript;
      if (last) setCommand(last);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setStatus("voice unavailable");
    };
    setListening(true);
    recognition.start();
  }, []);

  const handoff = useCallback(async (action: string) => {
    const repos = selectedReposRef.current;
    if (!window.confirm(`Send ${repos.length || 1} public repo(s) to Toolbox for ${action}?`)) return;
    setStatus("toolbox handoff");
    const res = await fetch("/api/internal/page-operator/toolbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, repos }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setStatus(body.message ?? body.error ?? `Toolbox ${res.status}`);
  }, []);

  return (
    <section
      data-agent-id="page.operator.panel"
      data-agent-label="Page operator panel"
      data-agent-risk="safe"
      aria-label="Page operator"
      className="fixed bottom-4 right-4 z-[60] w-[min(420px,calc(100vw-24px))] border border-border-secondary bg-bg-primary/95 p-3 shadow-[var(--shadow-overlay)] backdrop-blur"
      style={{ borderRadius: 6 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-text-primary">
          <Bot size={15} /> Agentic mode
        </span>
        <span
          data-agent-id="page.operator.status"
          className="truncate font-mono text-[10px] text-text-tertiary"
        >
          {status}
        </span>
      </div>
      <textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        rows={2}
        className="mb-2 w-full resize-none border border-border-secondary bg-bg-secondary px-2 py-2 text-[12px] text-text-primary outline-none focus:border-accent"
        placeholder={DEMO_COMMAND}
        data-agent-id="page.operator.command"
        data-agent-label="Operator command"
        data-agent-risk="safe"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={run} disabled={running} className="inline-flex items-center gap-1 border border-border-secondary px-2 py-1 text-[12px] text-text-primary disabled:opacity-50">
          <Play size={13} /> Run
        </button>
        <button type="button" onClick={startVoice} disabled={running || listening} className="inline-flex items-center gap-1 border border-border-secondary px-2 py-1 text-[12px] text-text-secondary disabled:opacity-50">
          {listening ? <MicOff size={13} /> : <Mic size={13} />} Voice
        </button>
        <button type="button" onClick={stop} className="inline-flex items-center gap-1 border border-border-secondary px-2 py-1 text-[12px] text-text-secondary">
          <Square size={13} /> Stop
        </button>
      </div>
      {plan ? (
        <div className="mt-2 font-mono text-[10px] text-text-tertiary">
          {plan.risk.toUpperCase()} - {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"}
        </div>
      ) : null}
      {brief ? (
        <div
          data-agent-id="page.operator.brief"
          data-agent-label="Generated operator brief"
          data-agent-risk="safe"
          className="mt-2 whitespace-pre-line border-t border-border-secondary pt-2 text-[11px] leading-relaxed text-text-secondary"
        >
          {brief}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => handoff("send_to_toolbox_scan")} className="border border-border-secondary px-2 py-1 text-[11px]">Toolbox scan</button>
            <button type="button" onClick={() => handoff("generate_founder_brief")} className="border border-border-secondary px-2 py-1 text-[11px]">Founder brief</button>
            <button type="button" onClick={() => setCommand("Add these to watchlist")} className="border border-border-secondary px-2 py-1 text-[11px]">Watchlist</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
