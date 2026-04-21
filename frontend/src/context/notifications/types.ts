import type { SlAlert } from "@shoelace-style/shoelace";
import type { TemplateResult } from "lit";

export const notificationsContextKey = Symbol("notifications");

export type Notification = {
  notifyType: "toast" | "progress";
  content: TemplateResult | string;
  notifyId?: string | number | symbol;
  variant?: SlAlert["variant"] | "info";
  closable?: SlAlert["closable"];
  duration?: SlAlert["duration"];
};
