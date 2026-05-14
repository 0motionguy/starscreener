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
