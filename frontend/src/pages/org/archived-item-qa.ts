import { html, css, nothing, type PropertyValues } from "lit";
import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { choose } from "lit/directives/choose.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { type AuthState } from "@/utils/AuthService";
import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";
import { NavigateController } from "@/controllers/navigate";
import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import { renderName } from "@/utils/crawler";
import type { ArchivedItem, ArchivedItemPage } from "@/types/crawler";
import { type APIPaginatedList } from "@/types/api";

export type QATab = "screenshots" | "replay";

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = css`
    :host {
      height: inherit;
      display: flex;
      flex-direction: column;
    }

    article {
      flex-grow: 1;
      display: grid;
      grid-gap: 1rem;
      grid-template:
        "mainHeader"
        "main"
        "pageListHeader"
        "pageList";
      grid-template-rows: repeat(4, max-content);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      article {
        grid-template:
          "mainHeader pageListHeader"
          "main pageList";
        grid-template-columns: 1fr 24rem;
        grid-template-rows: min-content 1fr;
      }
    }

    .mainHeader {
      grid-area: mainHeader;
    }

    .pageListHeader {
      grid-area: pageListHeader;
    }

    .main {
      grid-area: main;
    }

    .pageList {
      grid-area: pageList;
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  itemPageId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  @property({ type: String })
  tab: QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  @state()
  private pages?: APIPaginatedList<ArchivedItemPage>;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  protected willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ): void {
    if (changedProperties.has("itemId") && this.itemId) {
      void this.initItem();
    }
  }

  private async initItem() {
    void this.fetchCrawl();
    await this.fetchPages();

    const firstPage = this.pages?.items[0];
    if (!this.itemPageId && firstPage) {
      this.navigate.to(
        `${window.location.pathname}?itemPageId=${firstPage.id}`,
      );
    }
  }

  render() {
    if (!this.pages) {
      return html`loading pages...`;
    }

    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
    const itemName = this.item ? renderName(this.item) : nothing;
    return html`
      <nav class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${`${crawlBaseUrl}`}
          @click=${this.navigate.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">
            ${msg("Back to")} ${itemName}
          </span>
        </a>
      </nav>

      <article>
        <header class="mainHeader outline">
          <h1>${msg("Review")} &mdash; ${itemName}</h1>
        </header>
        <section class="main outline">
          <nav class="flex items-center justify-between p-2">
            <div class="flex gap-4">
              <btrix-navigation-button
                id="screenshot-tab"
                href=${`${crawlBaseUrl}/review/screenshots`}
                ?active=${this.tab === "screenshots"}
                @click=${this.navigate.link}
              >
                ${msg("Screenshots")}
              </btrix-navigation-button>
              <btrix-navigation-button
                id="replay-tab"
                href=${`${crawlBaseUrl}/review/replay`}
                ?active=${this.tab === "replay"}
                @click=${this.navigate.link}
              >
                ${msg("Replay")}
              </btrix-navigation-button>
            </div>
            <div class="flex gap-4">
              <sl-button size="small">
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                ${msg("Previous Page")}
              </sl-button>
              [btrix-page-qa-toolbar]
              <sl-button variant="primary" size="small">
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Next Page")}
              </sl-button>
            </div>
          </nav>
          <div role="region" aria-labelledby="${this.tab}-tab">
            ${choose(
              this.tab,
              [
                ["screenshots", this.renderScreenshots],
                ["replay", this.renderReplay],
              ],
              () => html`<btrix-not-found></btrix-not-found>`,
            )}
          </div>
        </section>
        <h2 class="pageListHeader outline">
          ${msg("Pages List")} <sl-button>${msg("Finish Review")}</sl-button>
        </h2>
        <section class="pageList outline">
          <ul>
            ${this.pages?.items.map(
              (page) => html`
                <li>
                  <a
                    class="underline"
                    href="${window.location.pathname}?itemPageId=${page.id}"
                    @click=${this.navigate.link}
                  >
                    id: ${page.id}</a
                  >
                </li>
              `,
            )}
          </ul>
          pg ${this.pages?.page} of
          ${this.pages
            ? Math.ceil(this.pages.total / this.pages.pageSize)
            : "unknown"}
        </section>
      </article>
    `;
  }

  private readonly renderScreenshots = () => {
    return html`[screenshots]`;
  };

  private readonly renderReplay = () => {
    return html`[replay]`;
  };

  private async fetchCrawl(): Promise<void> {
    try {
      this.item = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchPages(): Promise<void> {
    try {
      this.pages = await this.getPages();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawl(): Promise<ArchivedItem> {
    return this.api.fetch<ArchivedItem>(
      `/orgs/${this.orgId}/crawls/${this.itemId}`,
      this.authState!,
    );
  }

  private async getPages(): Promise<APIPaginatedList<ArchivedItemPage>> {
    return this.api.fetch<APIPaginatedList<ArchivedItemPage>>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages`,
      this.authState!,
    );
  }
}
