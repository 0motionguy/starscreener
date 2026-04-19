import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "**/.next/**",
      "out/**",
      "build/**",
      // Claude Code worktree caches contain nested .next/ build artifacts
      // and nested node_modules; ignore the whole tree so lint only
      // inspects real source files.
      ".claude/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
