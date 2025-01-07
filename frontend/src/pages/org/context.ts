import { createContext } from "@lit/context";

import type { ProxiesAPIResponse } from "@/types/crawler";

export const proxiesContext = createContext<ProxiesAPIResponse | null>(
  "proxies",
);
