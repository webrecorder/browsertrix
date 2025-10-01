/**
 * Timezone ID is configured in web-test-runner config
 */
import { expect } from "@open-wc/testing";

import { getScheduleInterval, humanizeSchedule } from "./cron";

describe("cron utils", () => {
  describe("getScheduleInterval()", () => {
    it("handles daily intervals", () => {
      expect(getScheduleInterval("1 1 * * *")).to.equal("daily");
    });

    it("handles weekly intervals", () => {
      expect(getScheduleInterval("1 1 * * 1")).to.equal("weekly");
      expect(getScheduleInterval("1 1 * * FRI")).to.equal("weekly");
    });

    it("handles monthly intervals", () => {
      expect(getScheduleInterval("1 1 1 * *")).to.equal("monthly");
    });

    it("returns null if not daily, weekly, or monthly", () => {
      // Every minute:
      expect(getScheduleInterval("* * * * *")).to.equal(null);
      expect(getScheduleInterval("* 1 * * *")).to.equal(null);
      expect(getScheduleInterval("* * 1 * *")).to.equal(null);
      expect(getScheduleInterval("* * * 1 *")).to.equal(null);
      expect(getScheduleInterval("* * * * 1")).to.equal(null);
      expect(getScheduleInterval("*/5 * * * *")).to.equal(null);
      // Hourly:
      expect(getScheduleInterval("1 * * * *")).to.equal(null);
      expect(getScheduleInterval("0 */5 * * *")).to.equal(null);
      // Yearly:
      expect(getScheduleInterval("1 1 1 JAN *")).to.equal(null);
      expect(getScheduleInterval("1 1 1 1 *")).to.equal(null);
      expect(getScheduleInterval("1 1 1 1 1")).to.equal(null);
    });

    it("returns null for macros", () => {
      expect(getScheduleInterval("@yearly")).to.equal(null);
      expect(getScheduleInterval("@monthly")).to.equal(null);
      expect(getScheduleInterval("@weekly")).to.equal(null);
      expect(getScheduleInterval("@daily")).to.equal(null);
      expect(getScheduleInterval("@hourly")).to.equal(null);
    });
  });

  describe("humanizeSchedule()", () => {
    it("humanizes daily schedule", () => {
      expect(humanizeSchedule("30 1 * * *")).to.equal(
        "Every day at 1:30 PM GMT+12",
      );
    });

    it("humanizes weekly schedule", () => {
      expect(humanizeSchedule("30 1 * * 1")).to.equal(
        "Every Monday at 1:30 PM GMT+12",
      );
    });

    it("humanizes monthly schedule", () => {
      expect(humanizeSchedule("30 1 1 * *")).to.equal(
        "On day 1 of the month at 1:30 PM GMT+12",
      );
    });

    it("humanizes schedule without a known interval", () => {
      expect(humanizeSchedule("* * * * *")).to.equal("Every minute (UTC)");
      expect(humanizeSchedule("30 * 1 * *")).to.equal(
        "At 30 minutes past the hour, on day 1 of the month (UTC)",
      );
    });
  });
});
