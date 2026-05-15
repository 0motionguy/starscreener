import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
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
  const layout = source("src/app/layout.tsx");
  assert.match(
    layout,
    /<SidebarUserOverlayBridge enabled=\{Boolean\(clerkPublishableKey\)\} \/>/,
    "sidebar overlay bridge must not mount Clerk hooks when ClerkProvider is disabled",
  );

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
  const layout = source("src/app/layout.tsx");
  assert.match(
    layout,
    /<Header authEnabled=\{Boolean\(clerkPublishableKey\)\} \/>/,
    "header account must receive the resolved server auth state",
  );

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

test("hosted Clerk form waits for client-only referral state", () => {
  const body = source("src/components/auth/ClerkAuthForm.tsx");
  assert.match(body, /ready: false/);
  assert.match(body, /if \(!ready\) \{\s*return <ClerkAuthSkeleton \/>;\s*\}/);
  assert.match(body, /unsafeMetadata=\{metadata\}/);
});
