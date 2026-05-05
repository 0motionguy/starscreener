import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntityLogo } from "@/components/ui/EntityLogo";

vi.mock("next/image", () => ({
  default: ({ loader, priority, unoptimized, fetchPriority, ...props }: any) => (
    <img {...props} />
  ),
}));

afterEach(() => {
  cleanup();
});

describe("EntityLogo snapshot", () => {
  it("renders stable image markup", () => {
    const { container } = render(
      <EntityLogo
        src="https://example.com/logo.png"
        name="acme/toolkit"
        size={24}
        shape="square"
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
