/**
 * Join workflow settings for duplicating a workflow
 */
import { msg, str } from "@lit/localize";

import type { APIPaginatedList } from "@/types/api";
import type {
  ScopeType,
  Seed,
  Workflow,
  WorkflowParams,
} from "@/types/crawler";
import {
  NewWorkflowOnlyScopeType,
  type StorageSeedFile,
} from "@/types/workflow";

export type DuplicateWorkflowSettings = {
  workflow: WorkflowParams;
  scopeType?: ScopeType | NewWorkflowOnlyScopeType;
  seeds?: Seed[];
  seedFile?: StorageSeedFile;
};

export function settingsForDuplicate({
  workflow,
  seeds,
  seedFile,
}: {
  workflow: Workflow;
  seeds?: APIPaginatedList<Seed>;
  seedFile?: StorageSeedFile;
}): DuplicateWorkflowSettings {
  const workflowParams: WorkflowParams = {
    ...workflow,
    name: workflow.name ? msg(str`${workflow.name} Copy`) : "",
  };

  const seedItems = seeds?.items;

  return {
    scopeType:
      seedFile || (seedItems?.length && seedItems.length > 1)
        ? NewWorkflowOnlyScopeType.PageList
        : workflowParams.config.scopeType,
    workflow: workflowParams,
    seeds: seedItems,
    seedFile,
  };
}
