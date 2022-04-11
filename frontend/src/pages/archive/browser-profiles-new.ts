import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new></btrix-browser-profiles-new>
 * ```
 */
@localized()
export class NewBrowserProfile extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId?: string;

  render() {
    return html`TODO`;
  }
}

customElements.define("btrix-browser-profiles-new", NewBrowserProfile);
