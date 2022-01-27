import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-crawls></btrix-crawls>
 * ```
 */
@localized()
export class Crawls extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  render() {
    return html`TODO`;
  }
}

customElements.define("btrix-crawls", Crawls);
