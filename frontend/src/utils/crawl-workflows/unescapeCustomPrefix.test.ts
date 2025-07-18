import { expect } from "@open-wc/testing";

import { unescapeCustomPrefix } from "./unescapeCustomPrefix";

describe("unescapeCustomPrefix", () => {
  it("doesn't modify a text URL", () => {
    expect(unescapeCustomPrefix("https://example.com/")).to.equal(
      "https://example.com/",
    );
  });

  it("doesn't modify a text URL with query params", () => {
    expect(
      unescapeCustomPrefix("https://example.com/page?query&foo=bar"),
    ).to.equal("https://example.com/page?query&foo=bar");
  });

  it("escapes a regex URL", () => {
    expect(unescapeCustomPrefix("https://example\\.com/")).to.equal(
      "https://example.com/",
    );
  });

  it("escapes a regex URL with query params", () => {
    expect(
      unescapeCustomPrefix("https://example\\.com/page\\?query&foo=bar"),
    ).to.equal("https://example.com/page?query&foo=bar");
  });

  it("removes leading ^ from a regex URL", () => {
    expect(unescapeCustomPrefix("^https://example\\.com/")).to.equal(
      "https://example.com/",
    );
  });

  it("removes multiple leading ^ from a regex URL", () => {
    expect(unescapeCustomPrefix("^^^https://example\\.com/")).to.equal(
      "https://example.com/",
    );
  });
});
