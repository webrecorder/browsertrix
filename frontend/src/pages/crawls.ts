import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { ROUTES } from "../routes";
import "./archive/crawl-detail";
import "./archive/crawls-list";

@needLogin
@localized()
export class Crawls extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  crawlId?: string;

  render() {
    return html` <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
      ${this.crawlId ? this.renderDetail() : this.renderList()}
    </div>`;
  }

  private renderDetail() {
    return html`
      <div class="mt-5">
        <btrix-crawl-detail
          .authState=${this.authState!}
          crawlId=${this.crawlId!}
          crawlsBaseUrl=${ROUTES.crawls}
          crawlsAPIBaseUrl="/archives/all/crawl"
        ></btrix-crawl-detail>
      </div>
    `;
  }

  private renderList() {
    return html`<btrix-crawls-list
      .authState=${this.authState!}
      crawlsBaseUrl=${ROUTES.crawls}
      crawlsAPIBaseUrl="/archives/all/crawl"
      shouldFetch
    ></btrix-crawls-list>`;
  }
}
