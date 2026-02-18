import type { OrgData } from "@/types/org";

export type BtrixRequestOrgUpdate = CustomEvent<{ org: Partial<OrgData> }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-request-org-update": BtrixRequestOrgUpdate;
  }
}
