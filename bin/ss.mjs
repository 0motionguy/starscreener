#!/usr/bin/env node
// Repo-local entry point. The 572-LOC implementation lives at cli/ss.mjs;
// `package.json:bin.ss` points here so `npm run cli:dev` and the published
// `starscreener-cli` package both end up executing the same module.
//
// Previously bin/ss.mjs and cli/ss.mjs were byte-for-byte duplicates,
// drifting on every fix. This shim collapses them to one source of truth.
import "../cli/ss.mjs";
