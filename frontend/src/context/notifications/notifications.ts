import { createContext } from "@lit/context";

import { notificationsContextKey, type Notification } from "./types";

export type NotificationsContext = Notification[];

export const notificationsInitialValue = [] satisfies NotificationsContext;

export const notificationsContext = createContext<NotificationsContext>(
  notificationsContextKey,
);
