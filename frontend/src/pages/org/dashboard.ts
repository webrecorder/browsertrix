import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "../../utils/LiteElement";
import type { OrgData } from "../../utils/orgs";

@localized()
export class Dashboard extends LiteElement {
  @property({ type: Object })
  org: OrgData | null = null;

  render() {
    return html`<header class="md:flex items-center gap-2 pb-3 mb-3 border-b">
        <h1
          class="flex-1 min-w-0 text-xl font-semibold leading-7 truncate mb-2 md:mb-0"
        >
          ${this.org?.name}
        </h1>
      </header>
      <main>TODO</main> `;
  }
}
customElements.define("btrix-dashboard", Dashboard);
