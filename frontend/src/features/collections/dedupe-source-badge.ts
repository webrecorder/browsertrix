import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-dedupe-source-badge")
@localized()
export class DedupeSourceBadge extends TailwindElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  render() {
    return html`<btrix-popover
      content=${msg("This collection is used as a deduplication source.")}
      hoist
    >
      <btrix-badge variant="orange" outline>
        <sl-icon
          class="mr-1.5"
          name="file-earmark-scan"
          library="app"
        ></sl-icon>
        ${msg("Dedupe")}
      </btrix-badge>
    </btrix-popover>`;
  }
}
