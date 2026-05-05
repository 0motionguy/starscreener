import type { ReactElement } from "react";

interface CriticalRouteStylesProps {
  route: "home" | "trending";
}

const HOME_CRITICAL_CSS = `
  .home-surface{max-width:1200px;margin:0 auto;padding:1rem}
  .page-head{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start}
  .page-head h1{margin:.25rem 0 0;font-size:clamp(1.35rem,2vw,2rem);line-height:1.2}
  .page-head .lede{margin:.5rem 0 0;max-width:72ch}
  .clock{display:flex;flex-direction:column;align-items:flex-end;gap:.15rem;white-space:nowrap}
  .clock .big{font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:.75rem}
  @media (max-width:960px){
    .page-head{grid-template-columns:1fr}
    .clock{align-items:flex-start}
  }
`;

const TRENDING_CRITICAL_CSS = `
  .terminal-page{max-width:1200px;margin:0 auto;padding:1rem}
  .terminal-page .page-head{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start}
  .terminal-page .page-head h1{margin:.25rem 0 0;font-size:clamp(1.2rem,1.8vw,1.8rem);line-height:1.2}
  .terminal-page .page-head .lede{margin:.5rem 0 0;max-width:72ch}
  .terminal-page .clock{display:flex;flex-direction:column;align-items:flex-end;gap:.15rem;white-space:nowrap}
  .terminal-page .clock .big{font-weight:700}
  @media (max-width:960px){
    .terminal-page .page-head{grid-template-columns:1fr}
    .terminal-page .clock{align-items:flex-start}
  }
`;

export function CriticalRouteStyles({ route }: CriticalRouteStylesProps): ReactElement {
  const css = route === "home" ? HOME_CRITICAL_CSS : TRENDING_CRITICAL_CSS;
  const deferredHref =
    route === "home" ? "/styles/home-noncritical.css" : "/styles/trending-noncritical.css";

  return (
    <>
      <style precedence={`critical-${route}`}>{css}</style>
      <link rel="preload" as="style" href={deferredHref} />
      <link
        rel="stylesheet"
        href={deferredHref}
        media="print"
        onLoad={(event) => {
          event.currentTarget.media = "all";
        }}
      />
      <noscript>
        <link rel="stylesheet" href={deferredHref} />
      </noscript>
    </>
  );
}

