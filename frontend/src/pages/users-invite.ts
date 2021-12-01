import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class UsersInvite extends LiteElement {
  @state()
  private serverError?: string;

  render() {
    if (this.serverError) {
      return html`<bt-alert type="danger">${this.serverError}</bt-alert>`;
    }
    return html` TODO `;
  }
}
