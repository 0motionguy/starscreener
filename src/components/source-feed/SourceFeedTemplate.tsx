import type { ReactNode } from "react";

import {
  NewsTopHeaderV3,
  type NewsTopHeaderV3Props,
} from "@/components/news/NewsTopHeaderV3";

interface SourceFeedTemplateProps {
  cold: boolean;
  coldState: ReactNode;
  header: NewsTopHeaderV3Props;
  children: ReactNode;
  maxWidthClassName?: string;
}

export function SourceFeedTemplate({
  cold,
  coldState,
  header,
  children,
  maxWidthClassName = "max-w-[1400px]",
}: SourceFeedTemplateProps) {
  return (
    <main className="v4-root font-mono">
      <div className={`${maxWidthClassName} mx-auto px-4 py-6 md:px-6 md:py-8`}>
        {cold ? (
          coldState
        ) : (
          <>
            <div className="mb-6">
              <NewsTopHeaderV3 {...header} />
            </div>
            {children}
          </>
        )}
      </div>
    </main>
  );
}
