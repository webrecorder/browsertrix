import { TailwindElement } from "@/classes/TailwindElement";
import { localized } from "@lit/localize";
import { css, html } from "lit";
import { customElement } from "lit/decorators.js";

@localized()
@customElement("btrix-components")
export class Home extends TailwindElement {
  static styles = css`
    :host {
      width: 100%;
    }
  `;
  render() {
    return html`<div class="flex w-full p-8 *:flex-auto">
      <btrix-navigation-button disabled>
        Disabled
        <btrix-badge variant="primary">1</btrix-badge>
      </btrix-navigation-button>
      <btrix-navigation-button>
        Default
        <btrix-badge variant="primary">2</btrix-badge>
      </btrix-navigation-button>
      <btrix-navigation-button>
        Hover
        <btrix-badge variant="primary">3</btrix-badge>
      </btrix-navigation-button>
      <btrix-navigation-button active>
        Active
        <btrix-badge variant="primary">4</btrix-badge>
      </btrix-navigation-button>
    </div>`;
  }
}
