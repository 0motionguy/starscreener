import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataList, DataRow } from "@/components/ui/DataList";

describe("DataList", () => {
  it("renders the list shell, optional header, and rows", () => {
    const { container, getByText } = render(
      <DataList header="Rank">
        <DataRow first>one</DataRow>
        <DataRow>two</DataRow>
      </DataList>,
    );

    expect(container.querySelector(".ds-list")).toBeTruthy();
    expect(container.querySelector(".ds-list-head")).toBeTruthy();
    expect(container.querySelector(".ds-list-row.first")).toBeTruthy();
    expect(getByText("one")).toBeTruthy();
    expect(getByText("two")).toBeTruthy();
  });
});
