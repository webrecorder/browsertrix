import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-card")
export class Card extends TailwindElement {
  render() {
    return html`
      <section class="flex h-full flex-col rounded border p-4">
        <h2 class="mb-3 border-b pb-3 text-base font-semibold leading-none">
          <slot name="title"></slot>
        </h2>
        <div class="flex-1">
          <slot></slot>
        </div>
        <slot name="footer"></slot>
      </section>
    `;
  }
}
