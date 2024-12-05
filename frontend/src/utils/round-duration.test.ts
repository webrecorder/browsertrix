/**
 * Tests for roundDuration. Test cases copied from {@linkcode https://github.com/sindresorhus/pretty-ms/blob/v7.0.1/test.js|pretty-ms@7.0.1's tests} and modified to work with {@linkcode Intl.DurationType}.
 */

import { expect } from "@open-wc/testing";

import humanizeDuration from "./round-duration";

it("rounds milliseconds", () => {
  expect(humanizeDuration(0), "0ms").to.deep.equal({ milliseconds: 0 });
  expect(humanizeDuration(0.1), "1ms").to.deep.equal({ milliseconds: 1 });
  expect(humanizeDuration(1), "1ms").to.deep.equal({ milliseconds: 1 });
  expect(humanizeDuration(999), "999ms").to.deep.equal({ milliseconds: 999 });
  expect(humanizeDuration(1000), "1s").to.deep.equal({ seconds: 1 });
  expect(humanizeDuration(1000 + 400), "1.4s").to.deep.equal({ seconds: 1 });
  expect(humanizeDuration(1000 * 2 + 400), "2.4s").to.deep.equal({
    seconds: 2,
  });
  expect(humanizeDuration(1000 * 55), "55s").to.deep.equal({ seconds: 55 });
  expect(humanizeDuration(1000 * 67), "1m 7s").to.deep.equal({
    minutes: 1,
    seconds: 7,
  });
  expect(humanizeDuration(1000 * 60 * 5), "5m").to.deep.equal({ minutes: 5 });
  expect(humanizeDuration(1000 * 60 * 67), "1h 7m").to.deep.equal({
    hours: 1,
    minutes: 7,
  });
  expect(humanizeDuration(1000 * 60 * 60 * 12), "12h").to.deep.equal({
    hours: 12,
  });
  expect(humanizeDuration(1000 * 60 * 60 * 40), "1d 16h").to.deep.equal({
    days: 1,
    hours: 16,
  });
  expect(humanizeDuration(1000 * 60 * 60 * 999), "41d 15h").to.deep.equal({
    days: 41,
    hours: 15,
  });
  expect(humanizeDuration(1000 * 60 * 60 * 24 * 465), "1y 100d").to.deep.equal({
    years: 1,
    days: 100,
  });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465),
    "1y 154d 6h",
  ).to.deep.equal({
    years: 1,
    days: 154,
    hours: 6,
  });
  expect(humanizeDuration(119999), "1m 59.9s").to.deep.equal({
    minutes: 1,
    seconds: 60,
  });
  expect(humanizeDuration(120000), "2m").to.deep.equal({ minutes: 2 });
});

it("has a compact option", () => {
  expect(humanizeDuration(1000 + 4, { compact: true }), "1s").to.deep.equal({
    seconds: 1,
  });
  expect(
    humanizeDuration(1000 * 60 * 60 * 999, { compact: true }),
    "41d",
  ).to.deep.equal({ days: 41 });
  expect(
    humanizeDuration(1000 * 60 * 60 * 24 * 465, { compact: true }),
    "1y",
  ).to.deep.equal({ years: 1 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { compact: true }),
    "1y",
  ).to.deep.equal({ years: 1 });
});

it("has a unitCount option", () => {
  expect(humanizeDuration(1000 * 60, { unitCount: 0 }), "1m").to.deep.equal({
    minutes: 1,
  });
  expect(humanizeDuration(1000 * 60, { unitCount: 1 }), "1m").to.deep.equal({
    minutes: 1,
  });
  expect(
    humanizeDuration(1000 * 60 * 67, { unitCount: 1 }),
    "1h",
  ).to.deep.equal({ hours: 1 });
  expect(
    humanizeDuration(1000 * 60 * 67, { unitCount: 2 }),
    "1h 7m",
  ).to.deep.equal({ hours: 1, minutes: 7 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 1 }),
    "1y",
  ).to.deep.equal({ years: 1 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 2 }),
    "1y 154d",
  ).to.deep.equal({ years: 1, days: 154 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 3 }),
    "1y 154d 6h",
  ).to.deep.equal({ years: 1, days: 154, hours: 6 });
});

it("has a separateMilliseconds option", () => {
  expect(
    humanizeDuration(1100, { separateMilliseconds: false }),
    "1.1s",
  ).to.deep.equal({ seconds: 1 });
  expect(
    humanizeDuration(1100, { separateMilliseconds: true }),
    "1s 100ms",
  ).to.deep.equal({ seconds: 1, milliseconds: 100 });
});

it("has a formatSubMilliseconds option", () => {
  expect(
    humanizeDuration(0.4, { formatSubMilliseconds: true }),
    "400µs",
  ).to.deep.equal({ microseconds: 400 });
  expect(
    humanizeDuration(0.123571, { formatSubMilliseconds: true }),
    "123µs 571ns",
  ).to.deep.equal({ microseconds: 123, nanoseconds: 571 });
  expect(
    humanizeDuration(0.123456789, { formatSubMilliseconds: true }),
    "123µs 456ns",
  ).to.deep.equal({ microseconds: 123, nanoseconds: 456 });
  expect(
    humanizeDuration(60 * 60 * 1000 + 23 * 1000 + 433 + 0.123456, {
      formatSubMilliseconds: true,
    }),
    "1h 23s 433ms 123µs 456ns",
  ).to.deep.equal({
    hours: 1,
    seconds: 23,
    milliseconds: 433,
    microseconds: 123,
    nanoseconds: 456,
  });
});

it("compact option overrides unitCount option", () => {
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      compact: true,
      unitCount: 1,
    }),
    "1 year",
  ).to.deep.equal({ years: 1 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      compact: true,
      unitCount: 2,
    }),
    "1 year",
  ).to.deep.equal({ years: 1 });
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      compact: true,
      unitCount: 3,
    }),
    "1 year",
  ).to.deep.equal({ years: 1 });
});

it("works with separateMilliseconds and formatSubMilliseconds options", () => {
  expect(
    humanizeDuration(1010.340067, {
      separateMilliseconds: true,
      formatSubMilliseconds: true,
    }),
    "1s 10ms 340µs 67ns",
  ).to.deep.equal({
    seconds: 1,
    milliseconds: 10,
    microseconds: 340,
    nanoseconds: 67,
  });
  expect(
    humanizeDuration(60 * 1000 + 34 + 0.000005, {
      separateMilliseconds: true,
      formatSubMilliseconds: true,
    }),
    "1m 34ms 5ns",
  ).to.deep.equal({ minutes: 1, milliseconds: 34, nanoseconds: 5 });
});

it("throws on invalid", () => {
  expect(() => {
    // @ts-expect-error forcefully passing a string
    humanizeDuration("foo");
  }).to.throw();

  expect(() => {
    humanizeDuration(Number.NaN);
  }).to.throw();

  expect(() => {
    humanizeDuration(Infinity);
  }).to.throw();
});
