import { msg } from "@lit/localize";

import type { WorkflowScopeType } from "@/types/workflow";

const scopeType: Record<
  (typeof WorkflowScopeType)[keyof typeof WorkflowScopeType],
  string
> = {
  ["page-list"]: msg("List of Pages"),
  prefix: msg("Pages in Same Directory"),
  host: msg("Pages on Same Domain"),
  domain: msg("Pages on Same Domain + Subdomains"),
  "page-spa": msg("Page Hashes"),
  page: msg("Single Page"),
  custom: msg("Custom Page Prefix"),
  any: msg("Any Page"),
};

export default scopeType;
