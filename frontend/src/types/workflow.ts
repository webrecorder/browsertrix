import { z } from "zod";

import type { StorageFile } from "./storage";

import type { TagCount, TagCounts } from "@/components/ui/tag-filter/types";
import {
  ScopeType,
  seedConfigSchema,
  seedSchema,
  workflowSettingsSchema,
} from "@/types/crawler";

export { NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from "./archivedItems";

export enum NewWorkflowOnlyScopeType {
  PageList = "page-list",
  Regex = "custom-regex",
}

export const WorkflowScopeType = { ...ScopeType, ...NewWorkflowOnlyScopeType };

export const workflowParamsSchema = workflowSettingsSchema.merge(
  z.object({
    config: seedConfigSchema.merge(
      z.object({
        seeds: z.array(seedSchema).nullable().optional(),
        seedFileId: z.string().nullable().optional(),
      }),
    ),
  }),
);
export type WorkflowParams = z.infer<typeof workflowParamsSchema>;

export type WorkflowTag = TagCount;
export type WorkflowTags = TagCounts;

export type StorageSeedFile = StorageFile & {
  firstSeed: string;
  seedCount: number;
};

export type WorkflowSearchValues = {
  crawlIds: string[];
  names: string[];
  descriptions: string[];
  firstSeeds: string[];
};
