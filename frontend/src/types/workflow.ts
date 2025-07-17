import type { StorageFile } from "./storage";

import { ScopeType, type Seed, type WorkflowParams } from "@/types/crawler";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };

export type WorkflowTag = {
  tag: string;
  count: number;
};

export type WorkflowTags = {
  tags: WorkflowTag[];
};

export type StorageSeedFile = StorageFile & {
  firstSeed: string;
  seedCount: number;
};

export type DuplicateWorkflowSettings = {
  workflow: WorkflowParams;
  scopeType?: ScopeType | NewWorkflowOnlyScopeType;
  seeds?: Seed[];
  seedFile?: StorageSeedFile;
};
