import { shuffle } from "lodash";

export const testData = shuffle([
  {
    title: "Example page with resource errors",
    screenshotMatch: 1,
    textMatch: 5,
    crawlResources: [6, 7],
    replayResources: [4, 7],
  },
  {
    title: "Example page with 4 error stats",
    screenshotMatch: 1,
    textMatch: 5,
    crawlResources: [6, 7],
    replayResources: [4, 7],
  },
  {
    title: "Example page with 2 error stats",
    screenshotMatch: 1,
    textMatch: 5,
    crawlResources: [6, 7],
    replayResources: [7, 7],
  },
  {
    title:
      "Example page, possible issues, 2 warnings, etc etc, extremely long title",
    screenshotMatch: 90,
    textMatch: 90,
    crawlResources: [12, 12],
    replayResources: [12, 12],
  },
  {
    title: "Example page, possible issues",
    screenshotMatch: 97,
    textMatch: 100,
    crawlResources: [12, 12],
    replayResources: [12, 12],
  },
  {
    title: "Example page, likely good",
    screenshotMatch: 100,
    textMatch: 100,
    crawlResources: [12, 12],
    replayResources: [12, 12],
  },
  {
    title: "Example page, likely good",
    screenshotMatch: 100,
    textMatch: 100,
    crawlResources: [12, 12],
    replayResources: [12, 12],
  },
]);

type Datum = (typeof testData)[number];

export function calculateSeverityFromDatum(
  datum: Datum,
): "severe" | "moderate" | "good" {
  // Severe
  if (
    datum.screenshotMatch < 50 ||
    datum.textMatch < 50 ||
    datum.crawlResources[0] < datum.crawlResources[1] - 2 ||
    datum.replayResources[0] < datum.replayResources[1] - 2
  ) {
    return "severe";
  }

  // Moderate
  if (
    datum.screenshotMatch < 100 ||
    datum.textMatch < 100 ||
    datum.crawlResources[0] < datum.crawlResources[1] ||
    datum.replayResources[0] < datum.replayResources[1]
  ) {
    return "moderate";
  }

  return "good";
}

export function errorsFromDatum(datum: Datum) {
  let errors = 0;
  if (calculateSeverityFromDatum(datum) === "severe") {
    if (datum.screenshotMatch < 50) errors++;
    if (datum.textMatch < 50) errors++;
    if (datum.crawlResources[0] < datum.crawlResources[1] - 2) errors++;
    if (datum.replayResources[0] < datum.replayResources[1] - 2) errors++;
  } else {
    if (datum.screenshotMatch < 100) errors++;
    if (datum.textMatch < 100) errors++;
    if (datum.crawlResources[0] < datum.crawlResources[1]) errors++;
    if (datum.replayResources[0] < datum.replayResources[1]) errors++;
  }
  return errors;
}
