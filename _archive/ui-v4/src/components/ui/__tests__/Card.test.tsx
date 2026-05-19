import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

describe("Card", () => {
  it("renders the panel variant by default", () => {
    const { getByText } = render(<Card>Panel content</Card>);
    const card = getByText("Panel content");

    expect(card.className).toContain("ds-card");
    expect(card.className).toContain("ds-card-panel");
  });

  it("supports feature, mini, and tool variants", () => {
    const { getByText } = render(
      <>
        <Card variant="feature">Featured</Card>
        <Card variant="mini">Mini</Card>
        <Card variant="tool">Tool</Card>
      </>,
    );

    expect(getByText("Featured").className).toContain("ds-card-feature");
    expect(getByText("Mini").className).toContain("ds-card-mini");
    expect(getByText("Tool").className).toContain("ds-card-tool");
  });

  it("marks active cards", () => {
    const { getByText } = render(
      <Card variant="tool" active>
        Revenue
      </Card>,
    );

    expect(getByText("Revenue").className).toContain("is-active");
  });

  it("renders a card header with corner marks and right slot", () => {
    const { container, getByText } = render(
      <Card>
        <CardHeader showCorner right="LIVE">
          Repos
        </CardHeader>
      </Card>,
    );

    expect(getByText("Repos").className).toBe("key");
    expect(getByText("LIVE").className).toBe("right");
    expect(container.querySelectorAll(".corner i")).toHaveLength(3);
  });

  it("renders a body wrapper", () => {
    const { getByText } = render(<CardBody>Rows</CardBody>);

    expect(getByText("Rows").className).toContain("ds-card-body");
  });
});
