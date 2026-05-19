import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Badge, Chip } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders tone, size, pip, and count affordances", () => {
    const { container, getByText } = render(
      <Badge tone="accent" size="xs" dot count={12}>
        New
      </Badge>,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("ds-badge");
    expect(root.className).toContain("ds-badge-accent");
    expect(root.className).toContain("ds-badge-xs");
    expect(container.querySelector(".ds-badge-pip")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
  });

  it("renders a clickable chip without changing button behavior", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Chip active count="7" onClick={onClick}>
        Agents
      </Chip>,
    );

    const chip = getByRole("button", { name: /agents 7/i });
    expect(chip.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
