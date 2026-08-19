/**
 * Number of active crawls in entire Browsertrix instance if superadmin
 * or in current org if logged in as a regular org user.
 */
import { createContext } from "@lit/context";

import { type ActiveCrawlCounts } from "./types";

export type ActiveCrawlsCountContext = ActiveCrawlCounts | undefined;

export const activeCrawlsCountContext = createContext<ActiveCrawlsCountContext>(
  "active-crawls-count",
);
