import assert from "node:assert/strict";
import test from "node:test";

import { metadata } from "../page";

test("/s/[shortId] metadata marks helper URL as non-indexable", () => {
  assert.equal(metadata.robots?.index, false);
  assert.equal(metadata.robots?.follow, false);
  assert.equal(metadata.robots?.noarchive, true);
});

test("/s/[shortId] metadata does not emit a canonical link", () => {
  assert.deepEqual(metadata.alternates ?? {}, {});
  assert.equal(
    Object.prototype.hasOwnProperty.call(metadata.alternates ?? {}, "canonical"),
    false,
  );
});
