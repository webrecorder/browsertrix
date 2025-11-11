import type { StorageFile } from "./storage";

import type { Tag, Tags } from "@/components/ui/tag-filter/types";
import { ScopeType } from "@/types/crawler";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };

export type WorkflowTag = Tag;
export type WorkflowTags = Tags;

export type StorageSeedFile = StorageFile & {
  firstSeed: string;
  seedCount: number;
};
