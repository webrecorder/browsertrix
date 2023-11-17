import { nothing } from "lit";
import {
  formatHours,
  humanizeExecutionSeconds,
} from "./executionTimeFormatter";
import { expect, fixture } from "@open-wc/testing";

describe("formatHours", () => {
  it("returns a time in hours, minutes, and seconds when given a time over an hour", () => {
    expect(formatHours(12_345, "en-US")).to.equal("\u00a0(3h 25m 45s)");
  });
  it("returns nothing when given a time that is exactly in minutes and nothing else", () => {
    expect(formatHours(3_540, "en-US")).to.equal(nothing);
  });
  it("returns 0m and seconds when given a time under a minute", () => {
    expect(formatHours(24, "en-US")).to.equal("\u00a0(0m 24s)");
  });
  it("returns minutes and seconds when given a time under an hour", () => {
    expect(formatHours(1_234, "en-US")).to.equal("\u00a0(20m 34s)");
  });
  it("returns just hours when given a time exactly in hours", () => {
    expect(formatHours(3_600, "en-US")).to.equal("\u00a0(1h)");
    expect(formatHours(44_442_000, "en-US")).to.equal("\u00a0(12,345h)");
  });
  it("returns nothing when given 0 seconds", () => {
    expect(formatHours(0, "en-US")).to.equal(nothing);
  });
  it("handles different locales correctly", () => {
    expect(formatHours(44_442_000_000, "en-IN")).to.equal(
      "\u00a0(1,23,45,000h)"
    );
    expect(formatHours(44_442_000_000, "pt-BR")).to.equal(
      "\u00a0(12.345.000 h)"
    );
    expect(formatHours(44_442_000_000, "de-DE")).to.equal(
      "\u00a0(12.345.000 Std.)"
    );
    expect(formatHours(44_442_000_000, "ar-EG")).to.equal(
      "\u00a0(١٢٬٣٤٥٬٠٠٠ س)"
    );
  });
});

describe("humanizeExecutionSeconds", () => {
  it("formats a given time in billable minutes", async () => {
    const parentNode = document.createElement("div");
    const el = await fixture(humanizeExecutionSeconds(1234567890), {
      parentNode,
    });
    expect(el.getAttribute("title")).to.equal("20,576,132 minutes");
    expect(el.textContent?.trim()).to.equal("21M minutes");
    expect(parentNode.innerText).to.equal(
      "21M minutes\u00a0(342,935h 31m 30s)"
    );
  });

  it("shows a short version when set", async () => {
    const parentNode = document.createElement("div");
    const el = await fixture(humanizeExecutionSeconds(1234567890, "short"), {
      parentNode,
    });
    expect(el.getAttribute("title")).to.equal(
      "20,576,132 minutes\u00a0(342,935h 31m 30s)"
    );
    expect(el.textContent?.trim()).to.equal("21M minutes");
    expect(parentNode.innerText).to.equal("21M minutes");
  });
});
