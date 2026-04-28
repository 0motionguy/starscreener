import type { V3AccentTheme } from "./themes";

export function applyV3AccentTheme(theme: V3AccentTheme) {
  const root = document.documentElement;

  root.dataset.v3Accent = theme.id;
  root.style.setProperty("--v3-acc", theme.acc);
  root.style.setProperty("--v3-acc-hover", theme.accHover);
  root.style.setProperty("--v3-acc-dim", theme.accDim);
  root.style.setProperty("--v3-acc-soft", theme.accSoft);
  root.style.setProperty("--v3-acc-glow", theme.accGlow);

  root.style.setProperty("--v2-acc", theme.acc);
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
