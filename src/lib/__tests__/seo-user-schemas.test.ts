import test from "node:test";
import assert from "node:assert/strict";

import { SITE_NAME, absoluteUrl } from "../seo";
import { buildUserPersonSchema } from "../seo-user-schemas";

test("buildUserPersonSchema emits Person JSON-LD for /u profile", () => {
  const schema = buildUserPersonSchema({
    handle: "mirko",
    name: "Mirko",
    bio: "Building tools.",
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    githubProfileUrl: "https://github.com/mirko",
  });

  assert.equal(schema["@context"], "https://schema.org");
  assert.equal(schema["@type"], "Person");
  assert.equal(schema["@id"], `${absoluteUrl("/u/mirko")}#person`);
  assert.equal(schema.url, absoluteUrl("/u/mirko"));
  assert.equal(schema.alternateName, "@mirko");
  assert.deepEqual(schema.sameAs, ["https://github.com/mirko"]);
});

test("buildUserPersonSchema falls back for missing optional fields", () => {
  const schema = buildUserPersonSchema({ handle: "alice" });

  assert.equal(schema.name, "alice");
  assert.ok(
    String(schema.description).includes(`@alice`) &&
      String(schema.description).includes(SITE_NAME),
  );
  assert.equal("image" in schema, false);
  assert.equal("sameAs" in schema, false);
});
