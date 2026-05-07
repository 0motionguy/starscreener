// Drizzle schema barrel — single import surface for all tables.
//
// Add new tables here as feature chunks land. Drizzle Kit reads this
// directory tree (per drizzle.config.ts → schema: "./src/lib/db/schema")
// to generate migrations, so any file referenced here will get tracked.

export * from "./profiles";
export * from "./watchlists";
export * from "./newsletter";
export * from "./alerts";
export * from "./referrals";
