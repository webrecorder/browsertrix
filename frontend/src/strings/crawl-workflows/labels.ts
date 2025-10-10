import { msg } from "@lit/localize";

import type { FormStateField } from "@/utils/workflow";

export const labelFor = {
  customBehavior: msg("Custom Behaviors"),
  autoscrollBehavior: msg("Autoscroll"),
  autoclickBehavior: msg("Autoclick"),
  pageLoadTimeoutSeconds: msg("Page Load Limit"),
  postLoadDelaySeconds: msg("Delay After Page Load"),
  behaviorTimeoutSeconds: "Behavior Limit",
  pageExtraDelaySeconds: msg("Delay Before Next Page"),
  selectLinks: msg("Link Selectors"),
  clickSelector: msg("Click Selector"),
  dedupeType: msg("Crawl Deduplication"),
} as const satisfies Partial<Record<FormStateField, string>>;
