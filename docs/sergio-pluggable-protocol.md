---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# Sergio Pluggable AISO-Fix Protocol

This protocol defines how to run Sergio against any project using AISO findings, while keeping execution pluggable across repos and deployment setups.

## 1. Inputs

- `target_url`: public URL to scan (for example `https://example.com`).
- `source_repo_path`: local repo path (read-write or read-only).
- `deploy_mode`: how fixes ship (`direct_commit`, `manual_patch_apply`, or `pr_only`).
- `constraints`: policy gates (no git access, no prod deploy, branch restrictions, etc.).

## 2. Scan Contract

1. Run deterministic scan first for stable findings.
2. Capture:
   - scan timestamp
   - score/tier
   - dimension scores
   - issue list with severity
3. Prioritize fixes by:
   - `critical` then `high`
   - weighted dimensions
   - lowest-effort highest-lift first

## 3. Patch Contract

For each selected finding, create:

- concrete file targets
- minimal unified diff
- why it maps to the finding
- expected score lift signal

If repo is read-only, do not mutate files; provide copy-pasteable diffs only.

## 4. Pluggable Backend Contract

Sergio uses the AISO protocol layer from `src/lib/aiso-tools.ts`:

- `AISO_SCAN_PROTOCOL`
- `AISO_SCAN_SUBMIT_PATH`
- `AISO_SCAN_STATUS_PATH_TEMPLATE`
- `AISO_SCAN_RESULT_PATH_TEMPLATE`
- `AISO_API_URL` (plus aliases)

Default remains `aiso.tools`, but any scanner backend can be wired by swapping these env vars.

## 5. Delivery Modes

### direct_commit
- Edit code directly.
- Run targeted verification.
- Commit and handoff branch/PR.

### manual_patch_apply
- Produce unified diffs only.
- Include apply order and verification commands.
- Mark issue `in_review` for human apply+deploy.

### pr_only
- Patch in branch.
- Open draft PR with issue-mapped checklist.

## 6. Verification Contract

Minimum verification:

1. run only tests impacted by changed surfaces
2. re-run deterministic scan on target URL
3. compare before/after for changed dimensions

Avoid full-repo test/build unless scope requires it.

## 7. Output Template

Each heartbeat should leave:

1. scan evidence
2. prioritized findings
3. patchset (or merged code)
4. verification evidence
5. explicit next action owner

## 8. Failure/Block Rules

- If scanner endpoint is rate-limited, use local deterministic scanner fallback.
- If blocked by permissions, mark blocker with unblock owner + exact action.
- If dependency work is large/parallel, split into child issues.
