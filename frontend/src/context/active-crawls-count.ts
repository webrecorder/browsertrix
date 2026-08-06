/**
 * Number of active crawls in entire Browsertrix instance.
 */
import { createContext } from "@lit/context";

export type ActiveCrawlsCountContext = number | undefined;

export const activeCrawlsCountContext = createContext<ActiveCrawlsCountContext>(
  "active-crawls-count",
);
