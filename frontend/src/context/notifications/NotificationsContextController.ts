import { ContextProvider } from "@lit/context";
import type { SlAlert } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type ReactiveController } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";

import {
  notificationsContext,
  notificationsInitialValue,
  type NotificationsContext,
} from "./notifications";
import type { Notification } from "./types";

import type { BtrixElement } from "@/classes/BtrixElement";
import type { NotifyEventDetail } from "@/controllers/notify";
import { tw } from "@/utils/tailwind";

const iconMap = {
  info: "info-circle",
  primary: "info-circle",
  success: "check2-circle",
  warning: "exclamation-diamond",
  danger: "x-octagon",
} as const;

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
  readonly #toastsWithIds = new Map<string | number | symbol, SlAlert>();

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
  }
  hostDisconnected(): void {
    this.#host.removeEventListener("btrix-notify", this.onNotify);
  }

  readonly renderNotifications = () => {
    return html` ${repeat(
      this.#context.value,
      ({ notifyId }) => notifyId,
      this.renderNotification,
    )}`;
  };

  private readonly renderNotification = (notification: Notification) => {
    const id = notification.notifyId;
    const variant =
      notification.variant === "info" ? undefined : notification.variant;

    return html`<sl-alert
      ${ref(
        id
          ? (el) => (el ? this.#toastsWithIds.set(id, el as SlAlert) : null)
          : undefined,
      )}
      class=${clsx(
        tw`[--sl-spacing-large:var(--sl-spacing-medium)]`,
        notification.notifyType === "toast" &&
          tw`[--sl-color-neutral-700:var(--sl-color-neutral-0)] [--sl-panel-background-color:var(--sl-color-neutral-1000)]`,
      )}
      variant=${ifDefined(variant)}
      duration=${ifDefined(notification.duration)}
      ?closable=${notification.closable}
    >
      ${notification.content}
    </sl-alert>`;
  };

  private readonly onNotify = (e: CustomEvent<NotifyEventDetail>) => {
    e.stopPropagation();

    const { id, message, title, icon, ...notification } = e.detail;

    if (notification.notifyType == "toast") {
      void this.addToast({
        ...notification,
        notifyId: id,
        content: html` <sl-icon
            name=${icon || iconMap[notification.variant || "primary"]}
            slot="icon"
          ></sl-icon>
          ${title
            ? html`<strong class="font-semibold">${title}</strong>`
            : nothing}
          ${message ? html`<div>${message}</div>` : nothing}`,
      });
    }
  };

  private async addToast(notification: Notification) {
    const id = notification.notifyId;
    const oldToast = id && this.#toastsWithIds.get(id);
    if (oldToast) {
      oldToast.addEventListener(
        "sl-after-hide",
        () => this.#toastsWithIds.delete(id),
        { once: true },
      );
      await oldToast.hide();
    }

    this.#context.setValue([...this.#context.value, notification]);
  }
}
