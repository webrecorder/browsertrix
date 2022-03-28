import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import "./archive/crawl-detail";

@needLogin
@localized()
export class Crawl extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  crawlId!: string;

  render() {
    return html`
      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <div class="mt-5">
          <btrix-crawl-detail
            .authState=${this.authState!}
            crawlId=${this.crawlId}
          ></btrix-crawl-detail>
        </div>
      </div>
    `;
  }
}
