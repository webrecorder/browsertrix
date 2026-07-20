import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-url-list")
@localized()
export class UrlList extends TailwindElement {
  @property({ type: Array })
  urls?: string[] = [];

  render() {
    if (!this.urls?.length) return;

    return html`<btrix-table>
      <btrix-table-body>
        ${this.urls.map(
          (url) =>
            html`<btrix-table-row>
              <btrix-table-cell>${url}</btrix-table-cell>
            </btrix-table-row>`,
        )}
      </btrix-table-body>
    </btrix-table>`;
  }
}
