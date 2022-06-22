import { parseCron } from "@cheap-glitch/mi-cron";
import { msg, str } from "@lit/localize";

export type ScheduleInterval = "daily" | "weekly" | "monthly";

/**
 * Parse interval from cron expression
 **/
export function getScheduleInterval(
  schedule: string
): "daily" | "weekly" | "monthly" {
  const [minute, hour, dayofMonth, month, dayOfWeek] = schedule.split(" ");
  if (dayofMonth === "*") {
    if (dayOfWeek === "*") {
      return "daily";
    }
    return "weekly";
  }
  return "monthly";
}

/**
 * Get human-friendly date from cron expression
 * Example: "Every day at 9:30 AM CDT"
 **/
export function humanizeNextDate(schedule: string): string {
  const nextDate = parseCron.nextDate(schedule);

  if (!nextDate) return "";

  return nextDate.toLocaleString(undefined, {
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
export function humanizeSchedule(schedule: string): string {
  const interval = getScheduleInterval(schedule);
  const { days } = parseCron(schedule)!;
  const nextDate = parseCron.nextDate(schedule)!;
  const formattedTime = nextDate.toLocaleString(undefined, {
    minute: "numeric",
    hour: "numeric",
    timeZoneName: "short",
  });
  let intervalMsg: any = "";

  switch (interval) {
    case "daily":
      intervalMsg = msg(str`Every day at ${formattedTime}`);
      break;
    case "weekly":
      intervalMsg = msg(
        str`Every ${nextDate.toLocaleString(undefined, { weekday: "long" })}
          at ${formattedTime}`
      );
      break;
    case "monthly":
      intervalMsg = msg(
        str`On day ${days[0]} of the month at ${formattedTime}`
      );
      break;
    default:
      break;
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
}: {
  interval: ScheduleInterval;
  minute: number | string;
  hour: number | string;
  period: "AM" | "PM";
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
  const dayOfMonth = interval === "monthly" ? localDate.getUTCDate() : "*";
  const dayOfWeek = interval === "weekly" ? localDate.getUTCDay() : "*";
  const month = "*";

  const schedule = `${localDate.getUTCMinutes()} ${localDate.getUTCHours()} ${dayOfMonth} ${month} ${dayOfWeek}`;

  return schedule;
}
