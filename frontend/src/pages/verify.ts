import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Verify extends LiteElement {
  @property({ type: String })
  token?: string;

  @state()
  private serverError?: string;

  firstUpdated() {
    if (this.token) {
      this.verify();
    }
  }

  render() {
    if (this.serverError) {
      return html`<bt-alert type="danger">${this.serverError}</bt-alert>`;
    }
    return html` <div class="text-4xl"><sl-spinner></sl-spinner></div> `;
  }

  private async verify() {
    const resp = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: this.token,
      }),
    });

    switch (resp.status) {
      case 200:
        this.navTo("/log-in");
        break;
      case 400:
        const { detail } = await resp.json();
        if (detail === "VERIFY_USER_BAD_TOKEN") {
          this.serverError = msg("This verification email is not valid.");
          break;
        }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }
  }
}
