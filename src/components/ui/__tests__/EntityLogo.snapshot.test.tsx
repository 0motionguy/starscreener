import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntityLogo } from "@/components/ui/EntityLogo";

// Mock next/image -> plain <img>. The next/image-only props (loader,
// priority, unoptimized, fetchPriority) aren't on ImgHTMLAttributes, so
// we type the param as a structural superset and let the rest spread to
// <img>.
vi.mock("next/image", () => ({
  default: ({
    loader: _loader,
    priority: _priority,
    unoptimized: _unoptimized,
    fetchPriority: _fetchPriority,
    ...props
  }: Record<string, unknown> & { alt?: string }) => (
    <img alt={props.alt ?? ""} {...(props as Record<string, unknown>)} />
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
