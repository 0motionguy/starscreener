import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Vendored Geist woff subsets for satori/ImageResponse rendering.
 *
 * satori (next/og) supports ttf/otf/woff but NOT woff2, so we commit the
 * latin .woff subsets from @fontsource/geist-{sans,mono} under
 * src/assets/fonts/geist and read them from disk (nodejs runtime only).
 * next.config.ts traces this directory for the standalone (VPS/Docker)
 * server via outputFileTracingIncludes.
 */

/** Font entry shape accepted by the ImageResponse `fonts` option. */
export interface OgFont {
  name: "Geist" | "Geist Mono";
  data: Buffer;
  weight: 400 | 600 | 800;
  style: "normal";
}

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts", "geist");

const FONT_FILES: ReadonlyArray<{
  file: string;
  name: OgFont["name"];
  weight: OgFont["weight"];
}> = [
  { file: "geist-sans-latin-400-normal.woff", name: "Geist", weight: 400 },
  { file: "geist-sans-latin-600-normal.woff", name: "Geist", weight: 600 },
  { file: "geist-sans-latin-800-normal.woff", name: "Geist", weight: 800 },
  { file: "geist-mono-latin-400-normal.woff", name: "Geist Mono", weight: 400 },
  { file: "geist-mono-latin-600-normal.woff", name: "Geist Mono", weight: 600 },
];

let cache: Promise<OgFont[]> | null = null;

/**
 * Load the Geist fonts for og card rendering. Memoized for the process
 * lifetime. On read failure logs and resolves to [] so og routes degrade to
 * satori's bundled default font instead of throwing a 500.
 */
export function loadOgFonts(): Promise<OgFont[]> {
  if (!cache) {
    cache = Promise.all(
      FONT_FILES.map(async ({ file, name, weight }) => {
        const data = await readFile(path.join(FONT_DIR, file));
        return { name, data, weight, style: "normal" as const };
      }),
    ).catch((err: unknown) => {
      console.error("[og-fonts] failed to load Geist woff subsets:", err);
      cache = null; // allow retry on the next request
      return [];
    });
  }
  return cache;
}
