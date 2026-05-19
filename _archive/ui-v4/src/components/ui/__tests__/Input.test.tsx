import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("renders a design-system input", () => {
    const { getByPlaceholderText } = render(
      <Input placeholder="Search repos" />,
    );

    expect(getByPlaceholderText("Search repos").className).toContain("ds-input");
  });

  it("renders optional left and right affordances", () => {
    const { container, getByLabelText } = render(
      <Input
        aria-label="Search"
        leftIcon={<span>icon</span>}
        rightSlot={<button type="button">Clear</button>}
      />,
    );

    expect(container.querySelector(".ds-input-wrap")?.className).toContain(
      "has-left-icon",
    );
    expect(container.querySelector(".ds-input-wrap")?.className).toContain(
      "has-right-slot",
    );
    expect(getByLabelText("Search")).toBeTruthy();
  });

  it("passes change handlers through unchanged", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <Input aria-label="Repo" onChange={onChange} />,
    );

    fireEvent.change(getByLabelText("Repo"), { target: { value: "next" } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
