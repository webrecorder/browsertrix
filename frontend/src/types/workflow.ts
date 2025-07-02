import { ScopeType } from "@/types/crawler";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };

export type WorkflowTag = {
  tag: string;
  count: number;
};

export type WorkflowTags = WorkflowTag[];
