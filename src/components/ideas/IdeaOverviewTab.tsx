// IdeaOverviewTab — 4 section blocks: What is this? / Why now? /
// Evidence snapshot / Suggested MVP. Sections parse out of idea.body
// markdown headings via parseOverview() (Wave A). When a section's
// heading is absent the block still renders with an empty-state — mockup
// parity rule: 4 blocks always visible.

import type { IdeaRecord } from "@/lib/ideas";
import { parseOverview } from "@/lib/ideas/parse-overview";

interface IdeaOverviewTabProps {
  idea: IdeaRecord;
}

const EMPTY_COPY = (
  <p className="muted">
    Author hasn&apos;t filled this in yet. Add a ## section to the idea body.
  </p>
);

export function IdeaOverviewTab({ idea }: IdeaOverviewTabProps) {
  const parsed = parseOverview(idea.body);
  // If the body has no parseable sections at all, the pitch is the best
  // fallback for "What is this?" — keeps the surface alive for older
  // ideas authored before the markdown sections were standardised.
  const whatIsThisFallback =
    !parsed.whatIsThis && !parsed.whyNow && !parsed.evidence && !parsed.mvp
      ? idea.pitch
      : undefined;
  const whatIsThis = parsed.whatIsThis ?? whatIsThisFallback;

  return (
    <section
      className="tab-pane tab-overview"
      role="tabpanel"
      aria-labelledby="idea-tab-overview"
    >
      <section className="section-block" aria-label="What is this?">
        <div className="section-title">
          <h2>What is this?</h2>
          <span>2 sentences</span>
        </div>
        {whatIsThis ? (
          <p className="short-copy">{whatIsThis}</p>
        ) : (
          EMPTY_COPY
        )}
      </section>

      <section className="section-block" aria-label="Why now?">
        <div className="section-title">
          <h2>Why now?</h2>
          <span>short reasons</span>
        </div>
        {parsed.whyNow ? (
          <p className="short-copy">{parsed.whyNow}</p>
        ) : (
          EMPTY_COPY
        )}
      </section>

      <section className="section-block" aria-label="Evidence snapshot">
        <div className="section-title">
          <h2>Evidence snapshot</h2>
          <span>why this exists</span>
        </div>
        {parsed.evidence && parsed.evidence.length > 0 ? (
          <ul className="evidence-list">
            {parsed.evidence.map((item, idx) => (
              <li key={`${idx}-${item.slice(0, 20)}`} className="evidence-row">
                <span className="note">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          EMPTY_COPY
        )}
      </section>

      <section className="section-block" aria-label="Suggested MVP">
        <div className="section-title">
          <h2>Suggested MVP</h2>
          <span>scope guard</span>
        </div>
        {parsed.mvp ? (
          <div className="mvp-columns">
            <div className="mvp-column">
              <h3>Must have</h3>
              {parsed.mvp.mustHave.length === 0 ? (
                <p className="muted">No items yet.</p>
              ) : (
                <ul>
                  {parsed.mvp.mustHave.map((entry, idx) => (
                    <li key={`mh-${idx}`}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mvp-column later">
              <h3>Later</h3>
              {parsed.mvp.later.length === 0 ? (
                <p className="muted">No items yet.</p>
              ) : (
                <ul>
                  {parsed.mvp.later.map((entry, idx) => (
                    <li key={`la-${idx}`}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mvp-column nope">
              <h3>Do not build yet</h3>
              {parsed.mvp.nope.length === 0 ? (
                <p className="muted">No items yet.</p>
              ) : (
                <ul>
                  {parsed.mvp.nope.map((entry, idx) => (
                    <li key={`no-${idx}`}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          EMPTY_COPY
        )}
      </section>
    </section>
  );
}
