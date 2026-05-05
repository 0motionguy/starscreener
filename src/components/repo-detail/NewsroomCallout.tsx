import type { NewsroomCrossLink } from "@/lib/newsroom-crosslinks";

interface NewsroomCalloutProps {
  link: NewsroomCrossLink;
}

export function NewsroomCallout({ link }: NewsroomCalloutProps) {
  return (
    <section className="rounded-card border border-border-primary bg-bg-secondary px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
        {"// AGNT NEWSROOM CROSS-LINK"}
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        Coverage found in AGNT Newsroom for this repository.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={link.newsroomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border-primary px-2 py-1 text-[12px] text-text-primary hover:bg-bg-tertiary"
        >
          {link.newsroomTitle}
          <span aria-hidden>↗</span>
        </a>
        <a
          href={link.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border-primary px-2 py-1 text-[12px] text-text-tertiary hover:bg-bg-tertiary"
        >
          Source
          <span aria-hidden>↗</span>
        </a>
      </div>
    </section>
  );
}

export default NewsroomCallout;

