import { html, css } from "lit";
import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import { TailwindElement } from "@/classes/TailwindElement";
import { type AuthState } from "@/utils/AuthService";
import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  static styles = css`
    :host {
      height: inherit;
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
      :host {
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

  render() {
    return html`
      <header class="mainHeader outline"><h1>${msg("Review")}</h1></header>
      <section class="main outline">[main]</section>
      <h2 class="pageListHeader outline">
        ${msg("Pages List")} <sl-button>${msg("Finish Review")}</sl-button>
      </h2>
      <section class="pageList outline">[page list]</section>
    `;
  }
}
