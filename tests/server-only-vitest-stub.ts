// Vitest stub for the `server-only` package. The real module throws on
// import to prevent server-only code from being bundled into client
// components. Under the vitest test runner that throw is pure noise:
// vitest evaluates server-component modules eagerly, so any route or lib
// file that has `import "server-only"` at the top crashes before its
// tests run. The tsx --test runner uses tests/setup-server-only-stub.cjs
// for the same purpose; this is the vitest counterpart, wired via
// `resolve.alias` in vitest.config.ts.
export {};
