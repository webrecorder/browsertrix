import { spy, stub, mock, restore } from "sinon";
import { fixture, expect } from "@open-wc/testing";

import { CrawlConfigEditor } from "./workflow-editor";

describe("btrix-workflow-editor", () => {
  it("is true", () => {
    expect(true).to.be.equal(false);
  });
  it("is defined", async () => {
    console.log("hey");
    const el = await fixture("<btrix-workflow-editor></btrix-workflow-editor>");
    expect(el).instanceOf(CrawlConfigEditor);
  });
});
