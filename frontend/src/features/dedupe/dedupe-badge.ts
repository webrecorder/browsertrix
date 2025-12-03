import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-dedupe-badge")
@localized()
export class DedupeBadge extends TailwindElement {
  @property({ type: Boolean })
  requiredByCrawls = false;

  render() {
    return html`<btrix-popover
      content=${this.requiredByCrawls
        ? msg(
            "This crawl is a required dependency of other crawls in the deduplication source collection.",
          )
        : msg(
            "This crawl is dependent on other crawls in the deduplication source collection.",
          )}
      hoist
    >
      <btrix-badge
        variant=${this.requiredByCrawls ? "cyan" : "orange"}
        class="font-monostyle"
      >
        <sl-icon
          class="mr-1.5"
          name=${this.requiredByCrawls
            ? "file-earmark-scan2"
            : "file-earmark-scan3"}
          library="app"
        ></sl-icon>
        ${this.requiredByCrawls ? msg("Dependency") : msg("Dependent")}
      </btrix-badge>
    </btrix-popover>`;
  }
}
