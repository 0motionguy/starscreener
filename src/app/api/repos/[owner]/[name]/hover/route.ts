import { NextResponse } from "next/server";

import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { githubFetch } from "@/lib/github-fetch";

export const runtime = "nodejs";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const COMMIT_COUNT = 3;

interface GithubCommitRow {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json({ ok: false, error: "Invalid repo slug" }, { status: 400 });
  }

  const fullName = `${owner}/${name}`;
  const repo = getDerivedRepoByFullName(fullName);
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Repo not found" }, { status: 404 });
  }

  const res = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?per_page=${COMMIT_COUNT}`,
    { operation: "repo-hover-preview" },
  );

  if (!res || !res.response.ok) {
    return NextResponse.json(
      { ok: true, ownerAvatarUrl: repo.ownerAvatarUrl, commits: [] },
      { headers: READ_CACHE_HEADERS },
    );
  }

  let payload: unknown;
  try {
    payload = await res.response.json();
  } catch {
    payload = [];
  }

  const rows = Array.isArray(payload) ? (payload as GithubCommitRow[]) : [];
  const commits = rows.slice(0, COMMIT_COUNT).map((row) => {
    const message = row.commit?.message?.trim() ?? "";
    return {
      sha: row.sha?.slice(0, 7) ?? "",
      message: message.split("\n")[0] ?? "",
      url: row.html_url ?? "",
    };
  }).filter((row) => row.sha && row.message);

  return NextResponse.json(
    { ok: true, ownerAvatarUrl: repo.ownerAvatarUrl, commits },
    { headers: READ_CACHE_HEADERS },
  );
}
