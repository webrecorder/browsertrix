import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Join extends LiteElement {
  @property({ type: String })
  token?: string;

  @state()
  private serverError?: string;

  firstUpdated() {
    if (this.token) {
      this.accept();
    }
  }

  render() {
    if (this.serverError) {
      return html`<bt-alert type="danger">${this.serverError}</bt-alert>`;
    }
    return html` <div class="text-4xl"><sl-spinner></sl-spinner></div> `;
  }

  private async accept() {
    const resp = await fetch(`/api/invite/accept/${this.token}`);

    switch (resp.status) {
      case 200:
        this.navTo("/log-in");
        break;
      case 401:
        const { detail } = await resp.json();
        if (detail === "Unauthorized") {
          this.serverError = msg("This invitation is not valid.");
          break;
        }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }
  }
}
