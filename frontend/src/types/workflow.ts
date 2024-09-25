import { ScopeType } from "@/types/crawler";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };
