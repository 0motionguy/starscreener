import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";

import { RepoCard } from "@/components/feed/RepoCard";
import type { Repo } from "@/lib/types";

// Mock next/image -> plain <img>. Strip the next/image-only props.
vi.mock("next/image", () => ({
  default: ({
    loader: _loader,
    priority: _priority,
    unoptimized: _unoptimized,
    fetchPriority: _fetchPriority,
    ...props
  }: Record<string, unknown> & { alt?: string }) => (
    <img alt={props.alt ?? ""} {...(props as Record<string, unknown>)} />
  ),
}));

vi.mock("@/components/repo/RepoHoverPrefetchLink", () => ({
  RepoHoverPrefetchLink: ({
    href,
    className,
    style,
    children,
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} className={className} style={style}>
      {children}
    </a>
  ),
}));

const repo = {
  id: "vercel--next-js",
  fullName: "vercel/next.js",
  name: "next.js",
  owner: "vercel",
  ownerAvatarUrl: "https://example.com/avatar.png",
  description: "The React framework for production.",
  categoryId: "web-frameworks",
  stars: 100000,
  starsDelta7d: 2000,
  momentumScore: 84,
  movementStatus: "hot",
  rank: 1,
  sparklineData: [1, 2, 3, 4, 5, 6, 7],
} as Repo;

afterEach(() => {
  cleanup();
});

describe("RepoCard snapshot", () => {
  it("renders stable card markup", () => {
    const { container } = render(<RepoCard repo={repo} showRank index={0} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
