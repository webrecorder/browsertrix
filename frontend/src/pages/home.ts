import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Boolean })
  isAdmin: boolean | null = null;

  render() {
    if (!this.authState) {
      return this.renderLoggedOut();
    }

    if (this.isAdmin === true) {
      return this.renderLoggedInAdmin();
    }

    if (this.isAdmin === false) {
      return this.renderLoggedInNonAdmin();
    }

    return html`spinner`;
  }

  private renderLoggedInAdmin() {
    return html`renderLoggedInAdmin`;
  }

  private renderLoggedInNonAdmin() {
    return html`renderLoggedInNonAdmin`;
  }

  private renderLoggedOut() {
    return html`renderLoggedOut`;
  }
}
