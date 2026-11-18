import { expect } from "@open-wc/testing";

import { urlPrefixToRegex } from "./urlPrefixToRegex";

describe("urlPrefixToRegex", () => {
  it("formats a text URL", () => {
    expect(urlPrefixToRegex("https://example.com/")).to.equal(
      "^https://example\\.com/",
    );
  });

  it("formats a partial text URL", () => {
    expect(urlPrefixToRegex("https://example.")).to.equal(
      "^https://example\\.",
    );
  });

  it("formats a text URL with query params", () => {
    expect(urlPrefixToRegex("https://example.com/page?query&foo=bar")).to.equal(
      "^https://example\\.com/page\\?query&foo=bar",
    );
  });

  it("doesn't re-escape a regex URL", () => {
    expect(urlPrefixToRegex("^https://example\\.com/")).to.equal(
      "^https://example\\.com/",
    );
  });

  it("escapes an unescaped regex URL", () => {
    expect(urlPrefixToRegex("^https://example.com/")).to.equal(
      "^https://example\\.com/",
    );
  });

  it("handles multiple leading `^`", () => {
    expect(urlPrefixToRegex("^^^https://example.com/")).to.equal(
      "^https://example\\.com/",
    );
  });

  it("fails silently if the URL doesn't start with http", () => {
    expect(urlPrefixToRegex("example.com")).to.equal("^example\\.com");
  });

  it("throws if the URL doesn't start with http and `throwOnInvalid` is true", () => {
    expect(() =>
      urlPrefixToRegex("example.com", { throwOnInvalid: true }),
    ).to.throw(Error);
  });
});
