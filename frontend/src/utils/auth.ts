import type LiteElement from "@/utils/LiteElement";
import type { AuthState } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";

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

    update(changedProperties: Map<string, any>) {
      if (this.authState) {
        super.update(changedProperties);
      } else {
        this.dispatchEvent(
          AuthService.createNeedLoginEvent(
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          )
        );
      }
    }
  };
}
