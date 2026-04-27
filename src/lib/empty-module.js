// Intentionally empty. Used as a Turbopack `resolveAlias` target so Node
// built-ins (`fs`, `dns`, `net`, etc.) resolve to a no-op stub when a
// transitive client import accidentally pulls them in. Mirrors the
// `webpack.resolve.fallback: { fs: false, ... }` block in next.config.ts.
module.exports = {};
