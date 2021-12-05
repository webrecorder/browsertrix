import { DASHBOARD_ROUTE } from "../routes";
import LiteElement from "../utils/LiteElement";
import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";

/**
 * Block rendering and dispatch event if user is not logged in
 *
 * Usage example:
 * ```ts
 * @needLogin
 * MyComponent extends LiteElement {}
 * ```
 */
export function needLogin<T extends { new (...args: any[]): LiteElement }>(
  constructor: T
) {
  return class extends constructor {
    authState?: AuthState;

    static get properties() {
      return {
        authState: { type: Object },
      };
    }

    connectedCallback() {
      if (this.authState) {
        super.connectedCallback();
      } else {
        this.dispatchEvent(new CustomEvent("need-login"));
      }
    }
  };
}
