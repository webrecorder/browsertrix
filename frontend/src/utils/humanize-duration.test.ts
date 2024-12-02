import { expect } from "@open-wc/testing";

import humanizeDuration from "./humanize-duration";

// describe("basic test cases", () => {
//   const cases = [
//     [0, { milliseconds: 0 }],
//     [0.1, { milliseconds: 1 }],
//     [1, { milliseconds: 1 }],
//     [999, { milliseconds: 999 }],
//     [1000, { seconds: 1 }],
//     [1000 + 400, { seconds: 1.4 }],
//     [1000 * 2 + 400, { seconds: 2.4 }],
//     [1000 * 55, { seconds: 55 }],
//     [1000 * 67, { minutes: 1, seconds: 7 }],
//     [1000 * 60 * 5, "5m"],
//     [1000 * 60 * 67, "1h 7m"],
//     [1000 * 60 * 60 * 12, "12h"],
//     [1000 * 60 * 60 * 40, "1d 16h"],
//     [1000 * 60 * 60 * 999, "41d 15h"],
//     [1000 * 60 * 60 * 24 * 465, "1y 100d"],
//     [1000 * 60 * 67 * 24 * 465, "1y 154d 6h"],
//     [119_999, "1m 59.9s"],
//     [120_000, "2m"],
//     [Number.MAX_SAFE_INTEGER, "285616y 151d 8h 59m 0.9s"],
//   ] as const;
//   cases.forEach(([val, expected]) => {
//     it(`formats ${val} correctly`, () => {
//       expect(humanizeDuration(val)).to.deep.equal(expected);
//     });
//   });
// });

it("prettify milliseconds", () => {
  expect(humanizeDuration(0), "0ms").to.deep.equal({ milliseconds: 0 });
  expect(humanizeDuration(0.1), "1ms").to.deep.equal({ milliseconds: 1 });
  expect(humanizeDuration(1), "1ms").to.deep.equal({ milliseconds: 1 });
  expect(humanizeDuration(999), "999ms").to.deep.equal({ milliseconds: 999 });
  expect(humanizeDuration(1000), "1s").to.deep.equal({ seconds: 1 });
  expect(humanizeDuration(1000 + 400), "1.4s").to.deep.equal({ seconds: 1.4 });
  expect(humanizeDuration(1000 * 2 + 400), "2.4s").to.deep.equal({
    seconds: 2.4,
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
    seconds: 59.9,
  });
  expect(humanizeDuration(120000), "2m").to.deep.equal({ minutes: 2 });
});

it("have a compact option", () => {
  expect(humanizeDuration(1000 + 4, { compact: true }), "1s");
  expect(humanizeDuration(1000 * 60 * 60 * 999, { compact: true }), "41d");
  expect(humanizeDuration(1000 * 60 * 60 * 24 * 465, { compact: true }), "1y");
  expect(humanizeDuration(1000 * 60 * 67 * 24 * 465, { compact: true }), "1y");
});

it("have a unitCount option", () => {
  expect(humanizeDuration(1000 * 60, { unitCount: 0 }), "1m");
  expect(humanizeDuration(1000 * 60, { unitCount: 1 }), "1m");
  expect(humanizeDuration(1000 * 60 * 67, { unitCount: 1 }), "1h");
  expect(humanizeDuration(1000 * 60 * 67, { unitCount: 2 }), "1h 7m");
  expect(humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 1 }), "1y");
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 2 }),
    "1y 154d",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, { unitCount: 3 }),
    "1y 154d 6h",
  );
});

it("have a secondsDecimalDigits option", () => {
  expect(humanizeDuration(10000), "10s");
  expect(humanizeDuration(33333), "33.3s");
  expect(humanizeDuration(999, { secondsDecimalDigits: 0 }), "999ms");
  expect(humanizeDuration(1000, { secondsDecimalDigits: 0 }), "1s");
  expect(humanizeDuration(1999, { secondsDecimalDigits: 0 }), "1s");
  expect(humanizeDuration(2000, { secondsDecimalDigits: 0 }), "2s");
  expect(humanizeDuration(33333, { secondsDecimalDigits: 0 }), "33s");
  expect(humanizeDuration(33333, { secondsDecimalDigits: 4 }), "33.3330s");
});

it("have a millisecondsDecimalDigits option", () => {
  expect(humanizeDuration(33.333), "33ms");
  expect(humanizeDuration(33.333, { millisecondsDecimalDigits: 0 }), "33ms");
  expect(
    humanizeDuration(33.333, { millisecondsDecimalDigits: 4 }),
    "33.3330ms",
  );
});

it("have a keepDecimalsOnWholeSeconds option", () => {
  expect(
    humanizeDuration(1000 * 33, {
      secondsDecimalDigits: 2,
      keepDecimalsOnWholeSeconds: true,
    }),
    "33.00s",
  );
  expect(
    humanizeDuration(1000 * 33.00004, {
      secondsDecimalDigits: 2,
      keepDecimalsOnWholeSeconds: true,
    }),
    "33.00s",
  );
});

it("have a verbose option", () => {
  const fn = (milliseconds: number) =>
    humanizeDuration(milliseconds, { verbose: true });

  expect(fn(0), "0 milliseconds");
  expect(fn(0.1), "1 millisecond");
  expect(fn(1), "1 millisecond");
  expect(fn(1000), "1 second");
  expect(fn(1000 + 400), "1.4 seconds");
  expect(fn(1000 * 2 + 400), "2.4 seconds");
  expect(fn(1000 * 5), "5 seconds");
  expect(fn(1000 * 55), "55 seconds");
  expect(fn(1000 * 67), "1 minute 7 seconds");
  expect(fn(1000 * 60 * 5), "5 minutes");
  expect(fn(1000 * 60 * 67), "1 hour 7 minutes");
  expect(fn(1000 * 60 * 60 * 12), "12 hours");
  expect(fn(1000 * 60 * 60 * 40), "1 day 16 hours");
  expect(fn(1000 * 60 * 60 * 999), "41 days 15 hours");
  expect(fn(1000 * 60 * 60 * 24 * 465), "1 year 100 days");
  expect(fn(1000 * 60 * 67 * 24 * 465), "1 year 154 days 6 hours");
});

it("have a separateMilliseconds option", () => {
  expect(humanizeDuration(1100, { separateMilliseconds: false }), "1.1s");
  expect(humanizeDuration(1100, { separateMilliseconds: true }), "1s 100ms");
});

it("have a formatSubMilliseconds option", () => {
  expect(humanizeDuration(0.4, { formatSubMilliseconds: true }), "400µs");
  expect(
    humanizeDuration(0.123571, { formatSubMilliseconds: true }),
    "123µs 571ns",
  );
  expect(
    humanizeDuration(0.123456789, { formatSubMilliseconds: true }),
    "123µs 456ns",
  );
  expect(
    humanizeDuration(60 * 60 * 1000 + 23 * 1000 + 433 + 0.123456, {
      formatSubMilliseconds: true,
    }),
    "1h 23s 433ms 123µs 456ns",
  );
});

it("work with verbose and compact options", () => {
  const fn = (milliseconds: number) =>
    humanizeDuration(milliseconds, {
      verbose: true,
      compact: true,
    });

  expect(fn(1000), "1 second");
  expect(fn(1000 + 400), "1 second");
  expect(fn(1000 * 2 + 400), "2 seconds");
  expect(fn(1000 * 5), "5 seconds");
  expect(fn(1000 * 55), "55 seconds");
  expect(fn(1000 * 67), "1 minute");
  expect(fn(1000 * 60 * 5), "5 minutes");
  expect(fn(1000 * 60 * 67), "1 hour");
  expect(fn(1000 * 60 * 60 * 12), "12 hours");
  expect(fn(1000 * 60 * 60 * 40), "1 day");
  expect(fn(1000 * 60 * 60 * 999), "41 days");
  expect(fn(1000 * 60 * 60 * 24 * 465), "1 year");
  expect(fn(1000 * 60 * 67 * 24 * 750), "2 years");
});

it("work with verbose and unitCount options", () => {
  expect(
    humanizeDuration(1000 * 60, { verbose: true, unitCount: 1 }),
    "1 minute",
  );
  expect(
    humanizeDuration(1000 * 60 * 67, { verbose: true, unitCount: 1 }),
    "1 hour",
  );
  expect(
    humanizeDuration(1000 * 60 * 67, { verbose: true, unitCount: 2 }),
    "1 hour 7 minutes",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      unitCount: 1,
    }),
    "1 year",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      unitCount: 2,
    }),
    "1 year 154 days",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      unitCount: 3,
    }),
    "1 year 154 days 6 hours",
  );
});

it("work with verbose and secondsDecimalDigits options", () => {
  const fn = (milliseconds: number) =>
    humanizeDuration(milliseconds, {
      verbose: true,
      secondsDecimalDigits: 4,
    });

  expect(fn(1000), "1 second");
  expect(fn(1000 + 400), "1.4000 seconds");
  expect(fn(1000 * 2 + 400), "2.4000 seconds");
  expect(fn(1000 * 5 + 254), "5.2540 seconds");
  expect(fn(33333), "33.3330 seconds");
});

it("work with verbose and millisecondsDecimalDigits options", () => {
  const fn = (milliseconds: number) =>
    humanizeDuration(milliseconds, {
      verbose: true,
      millisecondsDecimalDigits: 4,
    });

  expect(fn(1), "1.0000 millisecond");
  expect(fn(1 + 0.4), "1.4000 milliseconds");
  expect(fn(1 * 2 + 0.4), "2.4000 milliseconds");
  expect(fn(1 * 5 + 0.254), "5.2540 milliseconds");
  expect(fn(33.333), "33.3330 milliseconds");
});

it("work with verbose and formatSubMilliseconds options", () => {
  expect(
    humanizeDuration(0.4, { formatSubMilliseconds: true, verbose: true }),
    "400 microseconds",
  );
  expect(
    humanizeDuration(0.123571, {
      formatSubMilliseconds: true,
      verbose: true,
    }),
    "123 microseconds 571 nanoseconds",
  );
  expect(
    humanizeDuration(0.123456789, {
      formatSubMilliseconds: true,
      verbose: true,
    }),
    "123 microseconds 456 nanoseconds",
  );
  expect(
    humanizeDuration(0.001, { formatSubMilliseconds: true, verbose: true }),
    "1 microsecond",
  );
});

it("compact option overrides unitCount option", () => {
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      compact: true,
      unitCount: 1,
    }),
    "1 year",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      compact: true,
      unitCount: 2,
    }),
    "1 year",
  );
  expect(
    humanizeDuration(1000 * 60 * 67 * 24 * 465, {
      verbose: true,
      compact: true,
      unitCount: 3,
    }),
    "1 year",
  );
});

it("work with separateMilliseconds and formatSubMilliseconds options", () => {
  expect(
    humanizeDuration(1010.340067, {
      separateMilliseconds: true,
      formatSubMilliseconds: true,
    }),
    "1s 10ms 340µs 67ns",
  );
  expect(
    humanizeDuration(60 * 1000 + 34 + 0.000005, {
      separateMilliseconds: true,
      formatSubMilliseconds: true,
    }),
    "1m 34ms 5ns",
  );
});

// test.skip("throw on invalid", () => {
//   t.throws(() => {
//     humanizeDuration("foo");
//   });

//   t.throws(() => {
//     humanizeDuration(Number.NaN);
//   });

//   t.throws(() => {
//     humanizeDuration(Infinity);
//   });
// });

it("properly rounds milliseconds with secondsDecimalDigits", () => {
  const fn = (milliseconds: number) =>
    humanizeDuration(milliseconds, {
      verbose: true,
      secondsDecimalDigits: 0,
    });
  expect(fn(3 * 60 * 1000), "3 minutes");
  expect(fn(3 * 60 * 1000 - 1), "2 minutes 59 seconds");
  expect(fn(365 * 24 * 3600 * 1e3), "1 year");
  expect(
    fn(365 * 24 * 3600 * 1e3 - 1),
    "364 days 23 hours 59 minutes 59 seconds",
  );
  expect(fn(24 * 3600 * 1e3), "1 day");
  expect(fn(24 * 3600 * 1e3 - 1), "23 hours 59 minutes 59 seconds");
  expect(fn(3600 * 1e3), "1 hour");
  expect(fn(3600 * 1e3 - 1), "59 minutes 59 seconds");
  expect(fn(2 * 3600 * 1e3), "2 hours");
  expect(fn(2 * 3600 * 1e3 - 1), "1 hour 59 minutes 59 seconds");
});
