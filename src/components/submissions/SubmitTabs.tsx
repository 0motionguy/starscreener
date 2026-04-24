"use client";

import { useState } from "react";
import { DropRepoPage } from "./DropRepoPage";
import { IdeaComposer } from "@/components/builder/IdeaComposer";

interface Props {
  initialTab: "repo" | "idea";
}

export function SubmitTabs({ initialTab }: Props) {
  const [tab, setTab] = useState<"repo" | "idea">(initialTab);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <nav
        aria-label="Submit type"
        className="mb-6 inline-flex rounded-card border border-border-primary bg-bg-secondary p-1"
      >
        <button
          type="button"
          onClick={() => setTab("repo")}
          aria-pressed={tab === "repo"}
          className={`rounded-badge px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
            tab === "repo"
              ? "bg-bg-card text-text-primary"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          A repo
        </button>
        <button
          type="button"
          onClick={() => setTab("idea")}
          aria-pressed={tab === "idea"}
          className={`rounded-badge px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
            tab === "idea"
              ? "bg-bg-card text-text-primary"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          An idea
        </button>
      </nav>

      {tab === "repo" ? <DropRepoPage /> : <IdeaComposer />}
    </div>
  );
}
