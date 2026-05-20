export function AgentCommerceRouteStyles() {
  return (
    <style>{`
      .agent-commerce-page {
        padding: 16px 22px 32px;
        max-width: 1500px;
        margin: 0 auto;
      }

      .agent-commerce-ticker {
        grid-area: auto;
        min-height: var(--ticker-h);
        margin: 0 0 16px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
      }

      .agent-commerce-page .page-head,
      .agent-commerce-page .ac-head {
        align-items: end;
        gap: 18px;
        margin-bottom: 14px;
      }

      .agent-commerce-page .ac-kpi {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        margin-bottom: 18px;
        overflow: hidden;
      }

      .agent-commerce-page .panel {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
      }

      .agent-commerce-page .panel-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
      }

      .agent-commerce-page .panel-head .ph-eyebrow {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--accent);
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }

      .agent-commerce-page .panel-head .ph-title {
        font-size: 13px;
        color: var(--fg-bright);
        font-weight: 500;
      }

      .agent-commerce-page .panel-head .ph-meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-muted);
      }

      .agent-commerce-page .panel-head .ph-meta b {
        color: var(--fg-bright);
        font-weight: 500;
      }

      .agent-commerce-page .ac-cols {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-bottom: 14px;
      }

      .agent-commerce-page .tok-row {
        display: grid;
        grid-template-columns: 24px 1fr 80px 70px 80px;
        gap: 10px;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 12px;
      }

      .agent-commerce-page .tok-row:last-child,
      .agent-commerce-page .mover:last-child {
        border-bottom: 0;
      }

      .agent-commerce-page .mover {
        display: grid;
        grid-template-columns: 28px 36px 1fr 92px 80px 90px;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 12px;
      }

      .agent-commerce-page .mover:hover {
        background: var(--surface-2);
      }

      .agent-commerce-page .mover .badges {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .agent-commerce-page .onchain {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        padding: 14px 16px;
      }

      .agent-commerce-page .chain-block {
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .agent-commerce-page .ch-name.base {
        color: var(--info);
      }

      .agent-commerce-page .ch-name.solana {
        color: var(--up);
      }

      .agent-commerce-page .score-dist {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 2px;
        padding: 14px 16px;
        height: 80px;
        align-items: end;
      }

      @media (max-width: 1100px) {
        .agent-commerce-page .ac-kpi {
          grid-template-columns: repeat(2, 1fr);
        }

        .agent-commerce-page .ac-cols {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .agent-commerce-page {
          padding: 14px;
        }

        .agent-commerce-page .onchain {
          grid-template-columns: 1fr;
        }

        .agent-commerce-page .tok-row,
        .agent-commerce-page .mover {
          grid-template-columns: 24px 1fr;
        }

        .agent-commerce-page .tok-row > span:not(.r),
        .agent-commerce-page .mover > span,
        .agent-commerce-page .mover .badges {
          grid-column: 2;
        }
      }
    `}</style>
  );
}
