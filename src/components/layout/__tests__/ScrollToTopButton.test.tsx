import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("ScrollToTopButton", () => {
  it("stays hidden at 1000px and appears only above 1000px", async () => {
    setScrollY(1000);
    const { queryByRole } = render(<ScrollToTopButton />);
    expect(queryByRole("button", { name: "Scroll to top" })).toBeNull();

    setScrollY(1001);
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => {
      expect(queryByRole("button", { name: "Scroll to top" })).not.toBeNull();
    });
  });

  it("smooth-scrolls to top when clicked", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    setScrollY(1001);

    const { getByRole } = render(<ScrollToTopButton />);
    fireEvent.click(getByRole("button", { name: "Scroll to top" }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});
