import type LiteElement from "@/utils/LiteElement";
import type { AuthState } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";

/**
 * Block rendering and dispatch event if user is not logged in.
 * When using with other class decorators, `@needLogin` should
 * be closest to the component (see usage example.)
 *
 * @example Usage:
 * ```ts
 * @customElement("my-component")
 * @needLogin
 * MyComponent extends LiteElement {}
 * ```
 *
 * @fires btrix-need-login
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
          AuthService.createNeedLoginEvent({
            redirectUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          })
        );
      }
    }
  };
}
