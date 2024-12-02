import { expect } from "@open-wc/testing";

import humanizeDuration from "./humanize-duration";

describe("basic test cases", () => {
  const cases = [
    [0, { milliseconds: 0 }],
    [0.1, { milliseconds: 1 }],
    [1, { milliseconds: 1 }],
    [999, { milliseconds: 999 }],
    [1000, { seconds: 1 }],
    [1000 + 400, { seconds: 1.4 }],
    [1000 * 2 + 400, { seconds: 2.4 }],
    [1000 * 55, { seconds: 55 }],
    [1000 * 67, { minutes: 1, seconds: 7 }],
    [1000 * 60 * 5, "5m"],
    [1000 * 60 * 67, "1h 7m"],
    [1000 * 60 * 60 * 12, "12h"],
    [1000 * 60 * 60 * 40, "1d 16h"],
    [1000 * 60 * 60 * 999, "41d 15h"],
    [1000 * 60 * 60 * 24 * 465, "1y 100d"],
    [1000 * 60 * 67 * 24 * 465, "1y 154d 6h"],
    [119_999, "1m 59.9s"],
    [120_000, "2m"],
    [Number.MAX_SAFE_INTEGER, "285616y 151d 8h 59m 0.9s"],
  ] as const;
  cases.forEach(([val, expected]) => {
    it(`formats ${val} correctly`, () => {
      expect(humanizeDuration(val)).to.deep.equal(expected);
    });
  });
});
