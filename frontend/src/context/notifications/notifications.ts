import { createContext } from "@lit/context";

import { notificationsContextKey, type AppNotification } from "./types";

export type NotificationsContext = AppNotification[];

export const notificationsInitialValue = [] satisfies NotificationsContext;

export const notificationsContext = createContext<NotificationsContext>(
  notificationsContextKey,
);
