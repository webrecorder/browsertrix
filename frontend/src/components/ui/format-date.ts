import { localized } from "@lit/localize";
import { html, LitElement } from "lit";
import { customElement } from "lit/decorators/custom-element.js";
import { property } from "lit/decorators/property.js";

import { LocalizeController } from "@/controllers/localize";

/**
 * Re-implementation of Shoelace's `<sl-format-date>` element using
 * Browsertrix's localization implementation.
 *
 * This allows for multiple locales to be passed into the date formatter, in
 * order of the user's preferences.
 */
@customElement("btrix-format-date")
@localized()
export class FormatDate extends LitElement {
  private readonly localize = new LocalizeController(this);

  /**
   * The date/time to format. If not set, the current date and time will be used. When passing a string, it's strongly
   * recommended to use the ISO 8601 format to ensure timezones are handled correctly. To convert a date to this format
   * in JavaScript, use [`date.toISOString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString).
   */
  @property() date?: Date | string | null = new Date();

  @property() dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  @property() timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];

  /** The format for displaying the weekday. */
  @property() weekday?: "narrow" | "short" | "long";

  /** The format for displaying the era. */
  @property() era?: "narrow" | "short" | "long";

  /** The format for displaying the year. */
  // Technically "2-digit" is a valid option here too, but we've chosen not to
  // use it, because it's sometimes ambiguous
  @property() year?: "numeric";

  /** The format for displaying the month. */
  @property() month?: "numeric" | "2-digit" | "narrow" | "short" | "long";

  /** The format for displaying the day. */
  @property() day?: "numeric" | "2-digit";

  /** The format for displaying the hour. */
  @property() hour?: "numeric" | "2-digit";

  /** The format for displaying the minute. */
  @property() minute?: "numeric" | "2-digit";

  /** The format for displaying the second. */
  @property() second?: "numeric" | "2-digit";

  /** The format for displaying the time. */
  @property({ attribute: "time-zone-name" }) timeZoneName?: "short" | "long";

  /** The time zone to express the time in. */
  @property({ attribute: "time-zone" }) timeZone?: string;

  /** The format for displaying the hour. */
  @property({ attribute: "hour-format" }) hourFormat: "auto" | "12" | "24" =
    "auto";

  render() {
    if (!this.date) return undefined;
    const date = new Date(this.date);
    const hour12 =
      this.hourFormat === "auto" ? undefined : this.hourFormat === "12";

    // Check for an invalid date
    if (isNaN(date.getMilliseconds())) {
      return undefined;
    }

    return html`
      <time datetime=${date.toISOString()}>
        ${this.localize.date(date, {
          dateStyle: this.dateStyle,
          timeStyle: this.timeStyle,
          weekday: this.weekday,
          era: this.era,
          year: this.year,
          month: this.month,
          day: this.day,
          hour: this.hour,
          minute: this.minute,
          second: this.second,
          timeZoneName: this.timeZoneName,
          timeZone: this.timeZone,
          hour12: hour12,
        })}
      </time>
    `;
  }
}
