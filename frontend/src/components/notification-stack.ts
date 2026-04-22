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
 * Global notifications to stack in bottom end of the viewport.
 *
 * @fires btrix-remove-notification
 */
@customElement("btrix-notification-stack")
export class NotificationStack extends BtrixElement {
  @consume({ context: notificationsContext, subscribe: true })
  @state()
  private readonly notifications: NotificationsContext =
    notificationsInitialValue;

  readonly #namedNotifications = new Map<string, SlAlert>();

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("notifications") && this.notifications.length) {
      void this.handleChange();
    }
  }

  private async handleChange() {
    const newItem = this.notifications[this.notifications.length - 1];

    if (newItem.messageId) {
      await this.#namedNotifications.get(newItem.messageId)?.hide();
    }

    const el = this.shadowRoot?.querySelector<SlAlert>(
      `sl-alert[data-id="${newItem.id}"]`,
    );

    if (el) {
      void el.toast();
    } else {
      console.debug("no el with index", this.notifications.length - 1);
    }
  }

  render() {
    return repeat(this.notifications, ({ id }) => id, this.renderNotification);
  }

  private readonly renderNotification = (notification: AppNotification) => {
    const variant =
      notification.variant === "info" ? undefined : notification.variant;

    return html`<sl-alert
      data-id=${notification.id}
      class=${clsx(
        tw`[--sl-spacing-large:var(--sl-spacing-medium)]`,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- will add new notification types
        notification.type === "toast" &&
          tw`[--sl-color-neutral-700:var(--sl-color-neutral-0)] [--sl-panel-background-color:var(--sl-color-neutral-1000)]`,
      )}
      variant=${ifDefined(variant)}
      duration=${ifDefined(notification.duration)}
      ?closable=${notification.closable}
      @sl-show=${(e: CustomEvent) => {
        e.stopPropagation();
        if (notification.messageId) {
          this.#namedNotifications.set(
            notification.messageId,
            e.target as SlAlert,
          );
        }
      }}
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
              detail: { messageId: notification.messageId },
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
}
