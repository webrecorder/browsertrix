import { msg } from "@lit/localize";

import type { ScopeType } from "@/types/crawler";
import type { FormOnlyScopeType } from "@/utils/workflow";

const scopeType: Record<ScopeType | FormOnlyScopeType, string> = {
  ["page-list"]: msg("List of Pages"),
  prefix: msg("Pages in Same Directory"),
  host: msg("Pages on Same Domain"),
  domain: msg("Pages on Same Domain & Subdomains"),
  "page-spa": msg("Page Hashes"),
  page: msg("Single Page"),
  custom: msg("Custom Page Prefix"),
  any: msg("Any Page"),
};

export default scopeType;
