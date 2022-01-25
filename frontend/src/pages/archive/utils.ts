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
  interval: "daily" | "weekly" | "monthly";
  minute: number;
  hour: number;
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
