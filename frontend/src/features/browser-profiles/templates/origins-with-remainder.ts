import { html, nothing } from "lit";

import type { Profile } from "@/types/crawler";
import localize from "@/utils/localize";

/**
 * Displays primary origin with remainder in a popover badge
 */
export function originsWithRemainder(
  origins: Profile["origins"],
  { disablePopover } = { disablePopover: false },
) {
  const startingUrl = origins[0];
  const otherOrigins = origins.slice(1);

  return html`<div class="flex w-full items-center overflow-hidden">
    <btrix-code
      class="w-0 min-w-[10ch] max-w-min flex-1"
      language="url"
      value=${startingUrl}
      noWrap
      truncate
    ></btrix-code>
    ${otherOrigins.length
      ? html`
          <btrix-popover placement="right" hoist ?disabled=${disablePopover}>
            <btrix-badge
              variant=${disablePopover ? "text-neutral" : "text"}
              size="large"
              >+${localize.number(otherOrigins.length)}</btrix-badge
            >
            <ul slot="content">
              ${otherOrigins.map((url) => html`<li>${url}</li>`)}
            </ul>
          </btrix-popover>
        `
      : nothing}
  </div>`;
}
