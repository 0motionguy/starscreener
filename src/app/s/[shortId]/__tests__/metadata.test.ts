import assert from "node:assert/strict";
import test from "node:test";

import { metadata } from "../page";

test("/s/[shortId] metadata marks helper URL as non-indexable", () => {
  // metadata.robots is `string | Robots | null | undefined` — narrow to Robots
  const robots = metadata.robots as
    | { index?: boolean; follow?: boolean; noarchive?: boolean }
    | null
    | undefined;
  assert.equal(robots?.index, false);
  assert.equal(robots?.follow, false);
  assert.equal(robots?.noarchive, true);
});

test("/s/[shortId] metadata does not emit a canonical link", () => {
  assert.deepEqual(metadata.alternates ?? {}, {});
  assert.equal(
    Object.prototype.hasOwnProperty.call(metadata.alternates ?? {}, "canonical"),
    false,
  );
});
