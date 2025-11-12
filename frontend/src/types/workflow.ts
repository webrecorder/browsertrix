import type { StorageFile } from "./storage";

import type { TagCount, TagCounts } from "@/components/ui/tag-filter/types";
import { ScopeType } from "@/types/crawler";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };

export type WorkflowTag = TagCount;
export type WorkflowTags = TagCounts;

export type StorageSeedFile = StorageFile & {
  firstSeed: string;
  seedCount: number;
};
