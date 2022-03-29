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
    return html` <div
      class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border"
    >
      ${this.crawlId ? this.renderDetail() : this.renderList()}
    </div>`;
  }

  private renderDetail() {
    return html`
      <btrix-crawl-detail
        .authState=${this.authState!}
        crawlId=${this.crawlId!}
        crawlsBaseUrl=${ROUTES.crawls}
        crawlsAPIBaseUrl="/archives/all/crawls"
      ></btrix-crawl-detail>
    `;
  }

  private renderList() {
    return html`<btrix-crawls-list
      .authState=${this.authState!}
      crawlsBaseUrl=${ROUTES.crawls}
      crawlsAPIBaseUrl="/archives/all/crawls"
      shouldFetch
    ></btrix-crawls-list>`;
  }
}
