import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

afterEach(() => {
  cleanup();
});

describe("snapshot gate: six most-rendered components", () => {
  it("KpiBand stable markup", () => {
    const { container } = render(
      <KpiBand
        cells={[
          { label: "Signal volume · 24h", value: "42,184", delta: "+18.2%" },
          {
            label: "Sources · live",
            value: "8 / 8",
            sub: <LiveDot label="all healthy" />,
          },
        ]}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it("SectionHead stable markup", () => {
    const { container } = render(
      <SectionHead num="// 01" title="Trending now" meta="14 sources" />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it("LiveDot stable markup", () => {
    const { container } = render(<LiveDot tone="money" label="LIVE" />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it("PageHead stable markup", () => {
    const { container } = render(
      <PageHead
        crumb={
          <>
            <b>SIGNAL</b> · TERMINAL · /SIGNALS
          </>
        }
        h1="The newsroom for AI and dev tooling."
        lede="Eight sources. One editorial layer."
        clock={<span>14:00:00 UTC</span>}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it("VerdictRibbon stable markup", () => {
    const { container } = render(
      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// STAMP",
          headline: "28 APR · 06:29 UTC",
          sub: "computed 4m ago",
        }}
        text="14 strong consensus picks today."
        actionHref="/methodology"
        actionLabel="DOCS"
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it("Card stable markup", () => {
    const { container } = render(
      <Card variant="panel" active>
        <CardHeader showCorner right="LIVE">
          REPOS
        </CardHeader>
        <CardBody>Panel content</CardBody>
      </Card>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
