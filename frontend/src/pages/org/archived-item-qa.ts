import { html, css, type PropertyValueMap, nothing } from "lit";
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
import { type ArchivedItem } from "@/types/crawler";

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

  @property({ type: Boolean })
  isCrawler = false;

  @property({ type: String })
  tab: QATab = "screenshots";

  @state()
  private item?: ArchivedItem;

  private api = new APIController(this);
  private navigate = new NavigateController(this);
  private notify = new NotifyController(this);

  protected willUpdate(
    changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    if (changedProperties.has("itemId") && this.itemId) {
      this.fetchArchivedItem();
    }
  }

  render() {
    const crawlBaseUrl = `${this.navigate.orgBasePath}/items/crawl/${this.itemId}`;
    const itemName = this.item ? renderName(this.item) : nothing;
    return html`
      <nav class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
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
          <nav>
            <btrix-button
              id="screenshot-tab"
              href=${`${crawlBaseUrl}/review/screenshots`}
              variant=${this.tab === "screenshots" ? "primary" : "neutral"}
              ?raised=${this.tab === "screenshots"}
              @click=${this.navigate.link}
              >${msg("Screenshots")}</btrix-button
            >
            <btrix-button
              id="replay-tab"
              href=${`${crawlBaseUrl}/review/replay`}
              variant=${this.tab === "replay" ? "primary" : "neutral"}
              ?raised=${this.tab === "replay"}
              @click=${this.navigate.link}
              >${msg("Replay")}</btrix-button
            >
          </nav>
          <div role="region" aria-labelledby="${this.tab}-tab">
            ${choose(
              this.tab,
              [
                ["screenshots", this.renderScreenshots],
                ["replay", this.renderReplay],
              ],
              () => html`<btrix-not-found></btrix-not-found>`
            )}
          </div>
        </section>
        <h2 class="pageListHeader outline">
          ${msg("Pages List")} <sl-button>${msg("Finish Review")}</sl-button>
        </h2>
        <section class="pageList outline">[page list]</section>
      </article>
    `;
  }

  private renderScreenshots = () => {
    return html`[screenshots]`;
  };

  private renderReplay = () => {
    return html`[replay]`;
  };

  private async fetchArchivedItem(): Promise<void> {
    try {
      this.item = await this.getArchivedItem();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getArchivedItem(): Promise<ArchivedItem> {
    const apiPath = `/orgs/${this.orgId}/all-crawls/${this.itemId}`;
    return this.api.fetch<ArchivedItem>(apiPath, this.authState!);
  }
}
