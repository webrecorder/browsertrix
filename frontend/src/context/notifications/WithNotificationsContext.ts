import { ContextConsumer, type ContextCallback } from "@lit/context";
import type { LitElement } from "lit";
import type { Constructor } from "type-fest";

import {
  notificationsContext,
  notificationsInitialValue,
  type NotificationsContext,
} from "./notifications";

/**
 * Consume global notifications.
 *
 * @example Usage:
 * ```ts
 * class Component extends WithNotificationsContext(BtrixElement) {}
 * ```
 */
export const WithNotificationsContext = <T extends Constructor<LitElement>>(
  superClass: T,
) =>
  class extends superClass {
    protected notificationsContextUpdated: ContextCallback<NotificationsContext> =
      () => {};

    readonly #notifications = new ContextConsumer(this, {
      context: notificationsContext,
      callback: (value) => {
        this.notificationsContextUpdated(value);
      },
      subscribe: true,
    });

    public get notifications() {
      return this.#notifications.value || notificationsInitialValue;
    }
  };
