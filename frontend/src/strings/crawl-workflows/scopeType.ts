import { msg } from "@lit/localize";

import type { ScopeType } from "@/types/crawler";
import type { PageListScopeType } from "@/utils/workflow";

const scopeType: Record<ScopeType | PageListScopeType, string> = {
  ["page-list"]: msg("List of Pages"),
  prefix: msg("Pages in Same Directory"),
  host: msg("Pages on Same Domain"),
  domain: msg("Pages on Same Domain & Subdomains"),
  "page-spa": msg("Page Hashes"),
  page: msg("Single Page"),
  custom: msg("Custom Page Prefix"),
  any: msg("Any Linked Page"),
};

export default scopeType;
