import type { SlAlert } from "@shoelace-style/shoelace";
import type { TemplateResult } from "lit";

export const notificationsContextKey = Symbol("notifications");

export type AppNotification = {
  id: string;
  type: "toast";
  messageId?: string;
  message: TemplateResult | string;
  title?: string;
  variant?: SlAlert["variant"] | "info";
  closable?: SlAlert["closable"];
  duration?: SlAlert["duration"];
};

export type NotificationEventDetail = {
  id: AppNotification["id"];
};

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-remove-notification": CustomEvent<NotificationEventDetail>;
  }
}
