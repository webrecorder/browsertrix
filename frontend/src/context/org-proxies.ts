import { createContext } from "@lit/context";

import type { ProxiesAPIResponse } from "@/types/crawler";

export type OrgProxiesContext = ProxiesAPIResponse | null;

export const orgProxiesContext =
  createContext<OrgProxiesContext>("org-proxies");
