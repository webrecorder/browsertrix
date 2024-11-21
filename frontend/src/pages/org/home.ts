import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-org-home")
export class OrgHome extends BtrixElement {
  render() {
    return html`TODO`;
  }
}
