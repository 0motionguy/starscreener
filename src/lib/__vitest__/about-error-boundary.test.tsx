import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutError from "@/app/about/error";

afterEach(() => {
  cleanup();
});

describe("About error boundary", () => {
  it("renders fallback UI and digest when provided", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("about boom"), { digest: "about-digest-1" });
    const { getByText } = render(<AboutError error={error} reset={reset} />);

    expect(getByText("Something went wrong.")).toBeTruthy();
    expect(getByText("TRY AGAIN")).toBeTruthy();
    expect(getByText("BACK TO HOME")).toBeTruthy();
    expect(getByText("about-digest-1")).toBeTruthy();
  });

  it("invokes reset when Try Again is clicked", () => {
    const reset = vi.fn();
    const error = new Error("about boom");
    const { getByText } = render(<AboutError error={error} reset={reset} />);

    fireEvent.click(getByText("TRY AGAIN"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
