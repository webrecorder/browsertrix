import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-collection")
export class Collection extends BtrixElement {
  @property({ type: String })
  slug?: string;

  render() {
    return html`TODO`;
  }
}
