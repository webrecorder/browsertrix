import { parseCron } from "@cheap-glitch/mi-cron";
import { msg, str } from "@lit/localize";
import cronstrue from "cronstrue";

import localize from "./localize";

export const getNextDate = parseCron.nextDate;

export type ScheduleInterval = "daily" | "weekly" | "monthly";

/**
 * Parse interval from cron expression
 *
 * Known intervals:
 * Daily:   minute hour *          * *
 * Weekly:  minute hour *          * dayOfWeek
 * Monthly: minute hour dayOfMonth * *
 **/
export function getScheduleInterval(schedule: string): ScheduleInterval | null {
  const parts = schedule.split(" ");

  if (parts.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (minute.startsWith("*") || hour.startsWith("*") || month !== "*") {
    return null;
  }

  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return "daily";
  }

  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    return "weekly";
  }

  if (dayOfMonth !== "*" && dayOfWeek === "*") {
    return "monthly";
  }

  return null;
}

/**
 * Get human-friendly date from cron expression
 * Example: "Monday, December 12, 2022 at 12:00 AM PST"
 **/
export function humanizeNextDate(
  schedule: string,
  options: { length?: "short" } = {},
): string {
  const locale = localize.activeLanguage;
  const nextDate = parseCron.nextDate(schedule);

  if (!nextDate) return "";

  if (options.length === "short") {
    return nextDate.toLocaleString(locale, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }

  return nextDate.toLocaleString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "short",
  });
}

/**
 * Get human-friendly schedule from cron expression
 * Example: "Every day at 9:30 AM CDT"
 **/
export function humanizeSchedule(
  schedule: string,
  options: { length?: "short" } = {},
): string {
  const locale = localize.activeLanguage;
  const interval = getScheduleInterval(schedule);

  if (!interval) {
    try {
      const humanized = cronstrue.toString(schedule, {
        verbose: false, // TODO Support shorter string
        locale,
      });

      // Add timezone prefix
      return `${humanized} (UTC)`;
    } catch {
      return "";
    }
  }

  const parsed = parseCron(schedule);
  if (!parsed) {
    // Invalid date
    return "";
  }
  const { days } = parsed;
  const nextDate = parseCron.nextDate(schedule)!;
  const formattedWeekDay = nextDate.toLocaleString(locale, {
    weekday: "long",
  });

  let intervalMsg = "";

  if (options.length === "short") {
    switch (interval) {
      case "daily": {
        const formattedTime = nextDate.toLocaleString(locale, {
          minute: "numeric",
          hour: "numeric",
        });
        intervalMsg = msg(str`${formattedTime} daily`);
        break;
      }
      case "weekly":
        intervalMsg = msg(str`Every ${formattedWeekDay}`);
        break;
      case "monthly": {
        intervalMsg = localize.ordinal(days[0], {
          // This one doesn't make much sense in English, but it could in other languages/locales
          zero: msg(str`Monthly on the zeroth`, {
            id: "monthly-interval-ordinal-zero",
          }),
          one: msg(str`Monthly on the ${localize.number(days[0])}st`, {
            id: "monthly-interval-ordinal-one",
          }),
          two: msg(str`Monthly on the ${localize.number(days[0])}nd`, {
            id: "monthly-interval-ordinal-two",
          }),
          few: msg(str`Monthly on the ${localize.number(days[0])}rd`, {
            id: "monthly-interval-ordinal-few",
          }),
          many: msg(str`Monthly on the ${localize.number(days[0])}th`, {
            id: "monthly-interval-ordinal-many",
          }),
          other: msg(str`Monthly on the ${localize.number(days[0])}th`, {
            id: "monthly-interval-ordinal-other",
          }),
        });

        break;
      }

      default:
        break;
    }
  } else {
    const formattedTime = nextDate.toLocaleString(locale, {
      minute: "numeric",
      hour: "numeric",
      timeZoneName: "short",
    });

    switch (interval) {
      case "daily":
        intervalMsg = msg(str`Every day at ${formattedTime}`);
        break;
      case "weekly":
        intervalMsg = msg(str`Every ${formattedWeekDay} at ${formattedTime}`);
        break;
      case "monthly":
        intervalMsg = msg(
          str`On day ${nextDate.getDate()} of the month at ${formattedTime}`,
        );
        break;
      default:
        break;
    }
  }

  return intervalMsg;
}

/**
 * Get schedule as UTC cron job expression
 * https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax
 **/
export function getUTCSchedule({
  interval,
  minute,
  hour,
  period,
  dayOfWeek,
  dayOfMonth,
}: {
  interval: ScheduleInterval;
  minute: number | string;
  hour: number | string;
  period: "AM" | "PM";
  dayOfWeek?: number;
  dayOfMonth?: number;
}): string {
  const localDate = new Date();

  // Convert 12-hr to 24-hr time
  let periodOffset = 0;

  if (hour === 12) {
    if (period === "AM") {
      periodOffset = -12;
    }
  } else if (period === "PM") {
    periodOffset = 12;
  }

  localDate.setHours(+hour + periodOffset);
  localDate.setMinutes(+minute);

  if (interval === "monthly" && dayOfMonth) {
    localDate.setDate(dayOfMonth);
  } else if (interval == "weekly" && dayOfWeek) {
    localDate.setDate(localDate.getDate() + dayOfWeek - localDate.getDay());
  }

  const date = interval === "monthly" ? localDate.getUTCDate() : "*";
  const day = interval === "weekly" ? localDate.getUTCDay() : "*";
  const month = "*";

  const schedule = `${localDate.getUTCMinutes()} ${localDate.getUTCHours()} ${date} ${month} ${day}`;

  return schedule;
}
