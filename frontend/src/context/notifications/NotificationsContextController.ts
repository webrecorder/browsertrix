import { ContextProvider } from "@lit/context";
import { html, nothing, type ReactiveController } from "lit";
import { nanoid } from "nanoid";

import {
  notificationsContext,
  notificationsInitialValue,
  type NotificationsContext,
} from "./notifications";
import type { AppNotification, NotificationEventDetail } from "./types";

import type { BtrixElement } from "@/classes/BtrixElement";
import type { NotifyEventDetail } from "@/controllers/notify";

/**
 * Provides global notifications to subscribed descendents of a component.
 *
 * @example Usage:
 * ```ts
 * class Component extends BtrixElement {
 *   readonly [notificationsContextKey] = new NotificationsContextController(this);
 * }
 * ```
 */
export class NotificationsContextController implements ReactiveController {
  readonly #host: BtrixElement;
  readonly #context: ContextProvider<{ __context__: NotificationsContext }>;

  constructor(host: BtrixElement) {
    this.#host = host;
    this.#context = new ContextProvider(this.#host, {
      context: notificationsContext,
      initialValue: notificationsInitialValue,
    });

    host.addController(this);
  }

  hostConnected(): void {
    this.#host.addEventListener("btrix-notify", this.onNotify);
    this.#host.addEventListener(
      "btrix-remove-notification",
      this.onRemoveNotification,
    );
  }
  hostDisconnected(): void {
    this.#host.removeEventListener("btrix-notify", this.onNotify);
    this.#host.removeEventListener(
      "btrix-remove-notification",
      this.onRemoveNotification,
    );
  }

  private readonly onNotify = (e: CustomEvent<NotifyEventDetail>) => {
    e.stopPropagation();

    const { id, message, title, icon, ...notification } = e.detail;

    this.addNotification({
      closable: true,
      ...notification,
      id: nanoid(),
      messageId: id ? id.toString() : undefined,
      message: html`${icon
        ? html`<sl-icon name=${icon} slot="icon"></sl-icon>`
        : nothing}
      ${title ? html`<strong class="font-semibold">${title}</strong>` : nothing}
      ${message ? html`<div>${message}</div>` : nothing}`,
    });
  };

  private readonly onRemoveNotification = (
    e: CustomEvent<NotificationEventDetail>,
  ) => {
    e.stopPropagation();

    const notifications = this.#context.value;
    const idx = notifications.findIndex(
      ({ messageId }) => messageId === e.detail.messageId,
    );

    if (idx > -1) {
      this.#context.setValue([
        ...notifications.slice(0, idx),
        ...notifications.slice(idx + 1),
      ]);
    } else {
      console.debug("no notification with messageId"), e.detail.messageId;
    }
  };

  private addNotification(notification: AppNotification) {
    this.#context.setValue([...this.#context.value, notification]);
  }
}
