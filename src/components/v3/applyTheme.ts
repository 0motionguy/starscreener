import type { V3AccentTheme } from "./themes";

export function applyV3AccentTheme(theme: V3AccentTheme) {
  const root = document.documentElement;

  // Drives the [data-theme] CSS scopes in globals.css. This is what
  // makes the recolour site-wide rather than scoped to elements that
  // happen to read --v3-acc.
  root.dataset.theme = theme.id;
  root.dataset.v3Accent = theme.id;

  // Also prime the cascade variables so legacy callers that read
  // --v3-acc / --color-accent / --v2-acc / --color-brand directly keep
  // working. The CSS scopes still win because they apply later in the
  // cascade, but this keeps SSR / first-paint colour stable when the
  // pre-paint script has already run.
  root.style.setProperty("--v3-acc", theme.acc);
  root.style.setProperty("--v3-acc-hover", theme.accHover);
  root.style.setProperty("--v3-acc-dim", theme.accDim);
  root.style.setProperty("--v3-acc-soft", theme.accSoft);
  root.style.setProperty("--v3-acc-glow", theme.accGlow);

  root.style.setProperty("--color-accent", theme.acc);
  root.style.setProperty("--color-accent-hover", theme.accHover);
  root.style.setProperty("--color-accent-dim", theme.accDim);
  root.style.setProperty("--color-accent-soft", theme.accSoft);
  root.style.setProperty("--color-accent-glow", theme.accGlow);

  root.style.setProperty("--v2-acc", theme.acc);
  root.style.setProperty("--v2-acc-hover", theme.accHover);
  root.style.setProperty("--v2-acc-soft", theme.accSoft);
  root.style.setProperty("--v2-acc-glow", theme.accGlow);
  root.style.setProperty("--v2-acc-dim", theme.accDim);

  root.style.setProperty("--color-brand", theme.acc);
  root.style.setProperty("--color-brand-hover", theme.accHover);
  root.style.setProperty("--color-brand-active", theme.accDim);
  root.style.setProperty("--color-brand-glow", theme.accSoft);
  root.style.setProperty("--color-brand-glow-strong", theme.accGlow);
  root.style.setProperty("--color-border-focus", theme.acc);
}
