import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

test("root layout owns the only ClerkProvider", () => {
  assert.match(
    source("src/app/layout.tsx"),
    /import \{ ClerkProvider \} from "@clerk\/nextjs";/,
  );

  for (const path of [
    "src/components/layout/HeaderAccount.tsx",
    "src/components/layout/HeaderAccountLoaded.tsx",
    "src/app/sign-in/[[...sign-in]]/page.tsx",
    "src/app/sign-up/[[...sign-up]]/page.tsx",
  ]) {
    const body = source(path);
    assert.doesNotMatch(
      body,
      /ClerkProvider/,
      `${path} must use the root ClerkProvider, not mount its own`,
    );
  }
});

test("sidebar user overlay fetch waits for a signed-in Clerk user", () => {
  // V6 layout (post 2026-05-19 UI teardown, commit 8fdc0af) does not mount
  // <SidebarUserOverlayBridge> — the v6 shell sidebar
  // (src/components/shell/Sidebar.tsx) is anonymous-safe and renders the
  // same tree for signed-in vs signed-out users. The bridge component
  // stays on disk as the canonical re-mount point: when the v6 shell
  // re-introduces a user-specific overlay slot, the layout MUST pass
  // `enabled={Boolean(clerkPublishableKey)}` (proven invariant below).
  // If/when the layout adds the mount back, this regex must match.
  const layout = source("src/app/layout.tsx");
  if (/<SidebarUserOverlayBridge\b/.test(layout)) {
    assert.match(
      layout,
      /<SidebarUserOverlayBridge enabled=\{Boolean\(clerkPublishableKey\)\} \/>/,
      "sidebar overlay bridge must not mount Clerk hooks when ClerkProvider is disabled",
    );
  }

  const body = source("src/components/layout/SidebarUserOverlayBridge.tsx");
  assert.match(body, /import \{ useAuth \} from "@clerk\/nextjs";/);
  assert.match(body, /enabled: boolean/);
  assert.match(body, /if \(!enabled\) return null;/);
  assert.match(body, /const \{ isLoaded, userId \} = useAuth\(\);/);
  assert.match(body, /if \(!isLoaded\) \{\s*return;\s*\}/);
  assert.match(body, /if \(!userId\) \{[\s\S]*?reset\(\);[\s\S]*?return;\s*\}/);
  assert.match(body, /new URLSearchParams\(\{ userId \}\)/);
  assert.match(body, /\/api\/pipeline\/sidebar-overlay\?\$\{params\.toString\(\)\}/);
});

test("header account Clerk hook is client-only and auth gated", () => {
  // V6 layout (post 2026-05-19 UI teardown, commit 8fdc0af) does not mount
  // the legacy <Header> — the v6 shell uses
  // src/components/shell/Topbar.tsx instead. The Header → HeaderAccount
  // → HeaderAccountLoaded chain stays on disk as the canonical auth-
  // boundary pattern: when v6 wires an auth chip back into the shell,
  // it MUST go through this chain (server-resolved authEnabled prop,
  // dynamic ssr:false Clerk hook loader). If/when the layout mounts
  // <Header> again, this regex must match.
  const layout = source("src/app/layout.tsx");
  if (/<Header\b/.test(layout)) {
    assert.match(
      layout,
      /<Header authEnabled=\{Boolean\(clerkPublishableKey\)\} \/>/,
      "header account must receive the resolved server auth state",
    );
  }

  const header = source("src/components/layout/Header.tsx");
  assert.match(header, /authEnabled: boolean/);
  assert.match(header, /<HeaderAccount authEnabled=\{authEnabled\} \/>/);

  const account = source("src/components/layout/HeaderAccount.tsx");
  assert.doesNotMatch(account, /@clerk\/nextjs/);
  assert.doesNotMatch(account, /useUser\(\)/);
  assert.match(account, /authEnabled: boolean/);
  assert.match(account, /if \(!authEnabled\) \{/);
  assert.match(account, /ssr: false/);
  assert.match(account, /HeaderAccountLoaded/);

  const loaded = source("src/components/layout/HeaderAccountLoaded.tsx");
  assert.match(loaded, /const \[mounted, setMounted\] = useState\(false\);/);
  assert.match(loaded, /if \(!mounted\) \{/);
  assert.match(loaded, /HeaderAccountClerkState/);
  assert.match(loaded, /import \{ useUser \} from "@clerk\/nextjs";/);
  assert.match(loaded, /const \{ isLoaded, isSignedIn, user \} = useUser\(\);/);
});

test("sidebar chrome does not mount Clerk profile hooks during prerender", () => {
  const content = source("src/components/layout/SidebarContent.tsx");
  assert.doesNotMatch(content, /SidebarProfileCard/);
  assert.doesNotMatch(content, /@clerk\/nextjs/);
  assert.doesNotMatch(content, /useUser\(\)/);
});

test("only known callers may import Clerk hooks (useUser / useAuth)", () => {
  // Regression sentinel for the 2026-05-15 production crash. A client
  // component called `useUser()` after a
  // `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` env check. That check
  // is the WRONG signal — `getClerkPublishableKey()` fail-closes in Vercel
  // Production when only `pk_test_*` keys are configured, so the env var is
  // set but `<ClerkProvider>` is never mounted. The component crashed
  // every page with "useAuth can only be used within the <ClerkProvider />".
  //
  // The safe pattern is to take a server-resolved `publishableKey` /
  // `enabled` / `authEnabled` prop from the root layout (which alone calls
  // `getClerkPublishableKey()`). New Clerk-hook consumers MUST be added to
  // this allow-list and accept that prop. Anonymous-safe wrappers like
  // `useClientSession` (which fetches `/api/auth/session`) do NOT require
  // ClerkProvider and are preferred when the consumer only needs a
  // user-id.
  const ALLOW_LIST = new Set([
    // Lazy-loaded inside HeaderAccount under an authEnabled gate.
    join("src", "components", "layout", "HeaderAccountLoaded.tsx"),
    // Mounted at layout root under enabled={Boolean(clerkPublishableKey)}.
    join("src", "components", "layout", "SidebarUserOverlayBridge.tsx"),
    // Auth-form skeleton lives inside a Clerk-rendered tree by construction.
    join("src", "components", "auth", "ClerkAuthForm.tsx"),
    // Post-signup welcome modal gate (S2.A). Accepts an `authEnabled`
    // server-resolved prop and short-circuits before invoking useUser()
    // when ClerkProvider isn't mounted.
    join("src", "components", "onboarding", "WelcomeModalGate.tsx"),
    // Sign-in / sign-up route surfaces are children of the layout's
    // ClerkProvider and reach Clerk hooks via Clerk's own components.
  ]);

  const offenders: string[] = [];
  for (const path of walk(join(process.cwd(), "src"))) {
    if (path.includes(join("__tests__", ""))) continue;
    if (path.includes(join("__vitest__", ""))) continue;
    const body = readFileSync(path, "utf8");
    if (
      /from "@clerk\/(?:nextjs|clerk-react)"/.test(body) &&
      /\b(useUser|useAuth)\b/.test(body)
    ) {
      const rel = relative(process.cwd(), path);
      if (!ALLOW_LIST.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Unsanctioned Clerk-hook consumers found: ${offenders.join(", ")}.\n` +
      "Take a server-resolved publishableKey / enabled / authEnabled prop, " +
      "or use useClientSession instead. Then add the file to ALLOW_LIST above.",
  );
});

test("hosted Clerk form waits for client-only referral state", () => {
  const body = source("src/components/auth/ClerkAuthForm.tsx");
  assert.match(body, /ready: false/);
  assert.match(body, /if \(!ready\) \{\s*return <ClerkAuthSkeleton \/>;\s*\}/);
  assert.match(body, /unsafeMetadata=\{metadata\}/);
});
