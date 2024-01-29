import { html, css } from "lit";
import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { TailwindElement } from "@/classes/TailwindElement";
import { type AuthState } from "@/utils/AuthService";

@localized()
@customElement("btrix-archived-item-qa")
export class ArchivedItemQA extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  render() {
    return html`TODO`;
  }
}
