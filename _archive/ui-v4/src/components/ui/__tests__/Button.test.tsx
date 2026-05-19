import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/Button";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("renders a neutral md button by default", () => {
    const { getByRole } = render(<Button>Filters</Button>);
    const button = getByRole("button", { name: "Filters" });

    expect(button.className).toContain("ds-button");
    expect(button.className).toContain("ds-button-neutral");
    expect(button.className).toContain("ds-button-md");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("supports the primary CTA variant", () => {
    const { getByRole } = render(
      <Button variant="primary" size="lg">
        Drop repo
      </Button>,
    );

    expect(getByRole("button").className).toContain("ds-button-primary");
    expect(getByRole("button").className).toContain("ds-button-lg");
  });

  it("renders an optional status dot", () => {
    const { container } = render(<Button statusDot>Live</Button>);

    expect(container.querySelector(".ds-button-dot")).toBeTruthy();
  });

  it("marks active segmented buttons as pressed", () => {
    const { getByRole } = render(
      <Button variant="segment" active>
        7d
      </Button>,
    );

    expect(getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(getByRole("button").className).toContain("is-active");
  });

  it("passes click handlers through unchanged", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick}>Copy</Button>);

    fireEvent.click(getByRole("button", { name: "Copy" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
