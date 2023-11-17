import {
  humanizeSeconds,
  humanizeExecutionSeconds,
} from "./executionTimeFormatter";
import { expect, fixture } from "@open-wc/testing";

describe("formatHours", () => {
  it("returns a time in hours, minutes, and seconds when given a time over an hour", () => {
    expect(humanizeSeconds(12_345, "en-US")).to.equal("3h 25m 45s");
  });
  it("returns 0m and seconds when given a time under a minute", () => {
    expect(humanizeSeconds(24, "en-US")).to.equal("0m 24s");
  });
  it("returns minutes and seconds when given a time under an hour", () => {
    expect(humanizeSeconds(1_234, "en-US")).to.equal("20m 34s");
  });
  it("returns just hours when given a time exactly in hours", () => {
    expect(humanizeSeconds(3_600, "en-US")).to.equal("1h");
    expect(humanizeSeconds(44_442_000, "en-US")).to.equal("12,345h");
  });
  it("returns nothing when given 0 seconds", () => {
    expect(humanizeSeconds(0, "en-US")).to.equal("0s");
  });
  it("handles different locales correctly", () => {
    expect(humanizeSeconds(44_442_000_000, "en-IN")).to.equal("1,23,45,000h");
    expect(humanizeSeconds(44_442_000_000, "pt-BR")).to.equal("12.345.000 h");
    expect(humanizeSeconds(44_442_000_000, "de-DE")).to.equal(
      "12.345.000 Std."
    );
    expect(humanizeSeconds(44_442_000_000, "ar-EG")).to.equal("١٢٬٣٤٥٬٠٠٠ س");
  });
  it("formats zero time as expected", () => {
    expect(humanizeSeconds(0, "en-US")).to.equal("0s");
  });
  it("formats negative time as expected", () => {
    expect(() => humanizeSeconds(-100, "en-US")).to.throw(
      "humanizeSeconds in unimplemented for negative times"
    );
  });
});

describe("humanizeExecutionSeconds", () => {
  it("formats a given time in billable minutes", async () => {
    const parentNode = document.createElement("div");
    const el = await fixture(humanizeExecutionSeconds(1_234_567_890), {
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
    const el = await fixture(humanizeExecutionSeconds(1_234_567_890, "short"), {
      parentNode,
    });
    expect(el.getAttribute("title")).to.equal(
      "20,576,132 minutes\u00a0(342,935h 31m 30s)"
    );
    expect(el.textContent?.trim()).to.equal("21M minutes");
    expect(parentNode.innerText).to.equal("21M minutes");
  });
  it("skips the details when given a time less than an hour that is exactly in minutes", async () => {
    const parentNode = document.createElement("div");
    const el = await fixture(humanizeExecutionSeconds(3_540), {
      parentNode,
    });
    expect(el.getAttribute("title")).to.equal("59 minutes");
    expect(el.textContent?.trim()).to.equal("59 minutes");
    expect(parentNode.innerText).to.equal("59 minutes");
  });
});
