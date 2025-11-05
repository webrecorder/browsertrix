import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { secondaryHeading } from "@/layouts/secondaryPanel";

@customElement("btrix-card")
export class Card extends TailwindElement {
  render() {
    return html`
      <section class="flex h-full flex-col rounded border p-4">
        ${secondaryHeading({
          id: "cardHeading",
          heading: html`<slot name="title"></slot>`,
        })}
        <sl-divider class="my-4"></sl-divider>
        <div class="flex-1" aria-labelledby="cardHeading">
          <slot></slot>
        </div>
        <slot name="footer"></slot>
      </section>
    `;
  }
}
