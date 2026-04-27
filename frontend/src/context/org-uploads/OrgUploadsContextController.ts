import { ContextProvider } from "@lit/context";
import { type ReactiveController } from "lit";

import {
  orgUploadsContext,
  orgUploadsInitialValue,
  type OrgUploadsContext,
} from "./org-uploads";

import type { BtrixElement } from "@/classes/BtrixElement";

/**
 * Provides data on org uploads to subscribed descendents of a component.
 *
 * @example Usage:
 * ```ts
 * class Component extends BtrixElement {
 *   readonly [orgUploadsContextKey] = new OrgUploadsContextController(this);
 * }
 * ```
 */
export class OrgUploadsContextController implements ReactiveController {
  readonly #host: BtrixElement;
  readonly #context: ContextProvider<{ __context__: OrgUploadsContext }>;

  constructor(host: BtrixElement) {
    this.#host = host;
    this.#context = new ContextProvider(this.#host, {
      context: orgUploadsContext,
      initialValue: orgUploadsInitialValue,
    });

    host.addController(this);
  }

  hostConnected(): void {}
  hostDisconnected(): void {}
}
