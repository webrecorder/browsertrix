import { DurationFormat } from "@formatjs/intl-durationformat";
import { shouldPolyfill } from "@formatjs/intl-durationformat/should-polyfill";

async function polyfill() {
  const unsupportedLocale = shouldPolyfill();
  // This locale is supported
  if (!unsupportedLocale) {
    return;
  }
  // Load the polyfill 1st BEFORE loading data
  await import("@formatjs/intl-durationformat/polyfill-force");
}

export default DurationFormat;
