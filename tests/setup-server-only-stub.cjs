/* eslint-disable @typescript-eslint/no-require-imports */

// Stub the `server-only` sentinel for `tsx --test` runs.
//
// The `server-only` package's only purpose is to throw at bundle time
// when client-component code imports it. Under Node test runtime that
// throw is pure noise — `node:test` evaluates modules eagerly, so any
// route or lib file that has `import "server-only"` at the top crashes
// before its tests even start. Today this masks ~46 fails as a single
// generic "server-only" error and prevents the real assertions from
// running.
//
// This stub injects an empty module record into Node's require cache
// keyed at the EXACT resolved path, so any subsequent
// `require("server-only")` returns `{}` instead of throwing. It is
// scoped to that one module id; any other import error (a real bug)
// still surfaces normally.

const resolved = require.resolve("server-only");
const Module = require("module");
require.cache[resolved] = {
  id: resolved,
  filename: resolved,
  loaded: true,
  exports: {},
  children: [],
  paths: Module._nodeModulePaths(resolved),
};
