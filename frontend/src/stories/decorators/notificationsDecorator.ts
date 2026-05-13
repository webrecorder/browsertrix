import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { NotificationsContext } from "@/context/notifications";
import { notificationsInitialValue } from "@/context/notifications/notifications";
import { NotificationsContextController } from "@/context/notifications/NotificationsContextController";
import { notificationsContextKey } from "@/context/notifications/types";

import "@/components/toast-stack";

export type StorybookNotificationsProps = {
  notifications?: NotificationsContext;
};

@customElement("btrix-storybook-notifications")
export class StorybookOrg extends BtrixElement {
  @property({ type: Array, attribute: false })
  notifications: NotificationsContext = notificationsInitialValue;

  private readonly [notificationsContextKey] =
    new NotificationsContextController(this);

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("notifications")) {
      this.notifications.forEach((notification) => {
        this[notificationsContextKey].addNotification(notification);
      });
    }
  }

  render() {
    return html`<btrix-toast-stack></btrix-toast-stack> <slot></slot>`;
  }
}

export function notificationsDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { notifications } = args as StorybookNotificationsProps;

  return html`<btrix-storybook-notifications
    .notifications=${notifications || []}
  >
    ${story(args, context)}
  </btrix-storybook-notifications>`;
}
