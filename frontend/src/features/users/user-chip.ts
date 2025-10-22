import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@customElement("btrix-user-chip")
@localized()
export class UserChip extends BtrixElement {
  @property({ type: String })
  userId?: string;

  @property({ type: String })
  userName?: string;

  render() {
    if (!this.userName) return;

    return html`<btrix-badge
      class="max-w-full part-[base]:justify-start part-[base]:truncate"
      pill
      outline
      size="large"
      .role=${null}
    >
      ${this.userName}
    </btrix-badge>`;
  }
}
