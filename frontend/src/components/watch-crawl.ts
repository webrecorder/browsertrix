import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

type Page = {
  // Page URL
  url: string;
  // PNG dataURI
  data: string;
};

/**
 * Watch page crawl
 *
 * Usage example:
 * ```ts
 * <btrix-watch-crawl
 *   archiveId=${archiveId}
 *   crawlId=${crawlId}
 * ></btrix-watch-crawl>
 * ```
 */
@localized()
export class WatchCrawl extends LitElement {
  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private pages: {
    [pageId: string]: Page;
  } = {};

  connectedCallback() {
    if (this.archiveId && this.crawlId) {
      super.connectedCallback();
    } else {
      console.error("<btrix-watch-crawl> archiveId and crawlId is required");
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  render() {
    return html` ${Object.values(this.pages).map(this.renderPage)} `;
  }

  private renderPage(page: Page) {
    return html`
      <figure
        class="aspect-4/3 rounded border"
        aria-label=${msg("Stream of page ${page.url}")}
      ></figure>
    `;
  }
}
