import { consume } from "@lit/context";
import type { SlAlert } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";

import { BtrixElement } from "@/classes/BtrixElement";
import notificationsContext from "@/context/notifications";
import {
  notificationsInitialValue,
  type NotificationsContext,
} from "@/context/notifications/notifications";
import {
  type AppNotification,
  type NotificationEventDetail,
} from "@/context/notifications/types";
import { tw } from "@/utils/tailwind";

/**
 * Global toast notifications to stack in bottom end of the viewport.
 *
 * This component reuses `.sl-toast-stack` styles instead of using Shoelace's
 * `SlAlert.toast()` to reactively render the toast state of a notification
 * instead of relocating it in the DOM.
 *
 * @fires btrix-remove-notification
 */
@customElement("btrix-toast-stack")
export class NotificationStack extends BtrixElement {
  @consume({ context: notificationsContext, subscribe: true })
  @state()
  private readonly notifications: NotificationsContext =
    notificationsInitialValue;

  readonly #namedNotifications = new Map<string, SlAlert>();

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("notifications")) {
      const prevNotifications = changedProperties.get("notifications") as
        | NotificationsContext
        | undefined;

      const newNotifications = prevNotifications
        ? new Set(this.notifications).difference(new Set(prevNotifications))
        : this.notifications;

      newNotifications.forEach((item) => {
        void this.showAlert(item);
      });
    }
  }

  render() {
    return html`
      <div
        class=${clsx(
          "btrix-toast-stack",
          this.notifications.length && tw`min-h-20`,
        )}
      >
        ${repeat(this.notifications, ({ id }) => id, this.renderNotification)}
      </div>
    `;
  }

  private readonly renderNotification = (notification: AppNotification) => {
    const variant =
      notification.variant === "info" ? undefined : notification.variant;

    return html`<sl-alert
      data-id=${notification.id}
      class=${clsx(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- will add new notification types
        notification.type === "toast" &&
          (variant === "danger" || variant === "warning") &&
          tw`[--sl-color-neutral-700:var(--sl-color-neutral-0)] [--sl-panel-background-color:var(--sl-color-neutral-1000)]`,
      )}
      variant=${ifDefined(variant)}
      duration=${ifDefined(notification.duration)}
      ?closable=${notification.closable}
      @sl-hide=${(e: CustomEvent) => {
        e.stopPropagation();
        if (notification.messageId) {
          this.#namedNotifications.delete(notification.messageId);
        }
      }}
      @sl-after-hide=${(e: CustomEvent) => {
        e.stopPropagation();
        this.dispatchEvent(
          new CustomEvent<NotificationEventDetail>(
            "btrix-remove-notification",
            {
              detail: { id: notification.id },
              composed: true,
              bubbles: true,
            },
          ),
        );
      }}
    >
      ${notification.message}
    </sl-alert>`;
  };

  private async showAlert(item: AppNotification) {
    const messageId = item.messageId;
    const oldAlert = messageId && this.#namedNotifications.get(messageId);

    if (oldAlert) {
      await this.hideAlert(oldAlert);
    }

    const el = this.shadowRoot?.querySelector<SlAlert>(
      `sl-alert[data-id="${item.id}"]`,
    );

    if (!el) {
      console.debug("no sl-alert to show");
      return;
    }

    if (messageId) {
      this.#namedNotifications.set(messageId, el);
    }

    await el.updateComplete;
    await el.show();
  }

  private async hideAlert(el?: SlAlert) {
    if (!el) {
      console.debug("no sl-alert to hide");
      return;
    }

    await el.updateComplete;
    await el.hide();
  }
}
