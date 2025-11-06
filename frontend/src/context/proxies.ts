import { createContext } from "@lit/context";

import type { ProxiesAPIResponse } from "@/types/crawler";

export type ProxiesContext = ProxiesAPIResponse | null;

export const proxiesContext = createContext<ProxiesContext>("proxies");
