import { type BtrixElement } from "@/classes/BtrixElement";
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
export default function needLogin<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends { new (...args: any[]): BtrixElement },
>(constructor: T) {
  return class extends constructor {
    update(changedProperties: Map<string, unknown>) {
      if (this.authState) {
        super.update(changedProperties);
      } else {
        this.dispatchEvent(
          AuthService.createNeedLoginEvent({
            redirectUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          }),
        );
      }
    }
  };
}
