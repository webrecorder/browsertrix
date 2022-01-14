import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import type { ArchiveData } from "../../utils/archives";
import LiteElement, { html } from "../../utils/LiteElement";

type CrawlTemplate = {};

@localized()
export class CrawlTemplates extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Boolean })
  isNew!: Boolean;

  @property({ type: Array })
  crawlTemplates?: CrawlTemplate[];

  render() {
    if (this.isNew) {
      return this.renderNew();
    }

    return this.renderList();
  }

  private renderNew() {
    return html` <h1 class="text-xl font-bold">
      ${msg("New Crawl Template")}
    </h1>`;
  }

  private renderList() {
    return html`
      <div class="text-center">
        <sl-button>
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>
    `;
  }
}
