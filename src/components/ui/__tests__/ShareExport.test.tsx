import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ShareActionGrid,
  ShareExportHead,
  ShareExportPanel,
  ShareFormatButton,
  ShareFormatGrid,
  ShareMetaBlock,
  ShareMetaRow,
  ShareRow,
} from "@/components/ui/ShareExport";

describe("ShareExport", () => {
  it("renders share panel sections and controls", () => {
    const { container, getByText } = render(
      <ShareExportPanel>
        <ShareExportHead right="PNG">{"// SHARE"}</ShareExportHead>
        <ShareFormatGrid>
          <ShareFormatButton active label="X" size="1200x675" />
        </ShareFormatGrid>
        <ShareActionGrid>
          <button className="b acc" type="button">
            Download
          </button>
        </ShareActionGrid>
        <ShareMetaBlock>
          <ShareMetaRow label="Permalink">
            <input readOnly value="https://example.com" />
          </ShareMetaRow>
        </ShareMetaBlock>
        <ShareRow icon="X" heading="Post" description="Share on X" action="->" />
      </ShareExportPanel>,
    );

    expect(container.querySelector(".ds-share-panel")).toBeTruthy();
    expect(container.querySelector(".share-head .right")).toBeTruthy();
    expect(container.querySelector(".share-fmt .b.on")).toBeTruthy();
    expect(container.querySelector(".share-actions .b.acc")).toBeTruthy();
    expect(container.querySelector(".share-meta .row .l")).toBeTruthy();
    expect(container.querySelector(".share-row .ic")).toBeTruthy();
    expect(getByText("Download")).toBeTruthy();
    expect(getByText("Post")).toBeTruthy();
  });
});
