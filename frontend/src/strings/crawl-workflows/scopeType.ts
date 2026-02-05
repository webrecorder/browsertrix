import { msg } from "@lit/localize";

import {
  NewWorkflowOnlyScopeType,
  type WorkflowScopeType,
} from "@/types/workflow";

const scopeType: Record<
  (typeof WorkflowScopeType)[keyof typeof WorkflowScopeType],
  string
> = {
  [NewWorkflowOnlyScopeType.PageList]: msg("List of Pages"),
  prefix: msg("Pages in Same Directory"),
  host: msg("Pages on Same Domain"),
  domain: msg("Pages on Same Domain + Subdomains"),
  "page-spa": msg("In-Page Links"),
  page: msg("Single Page"),
  custom: msg("Pages with URL Prefix"),
  [NewWorkflowOnlyScopeType.Regex]: msg("Custom Page Match"),
  any: msg("Any Page"),
};

export default scopeType;
