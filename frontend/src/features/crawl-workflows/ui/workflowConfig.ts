import { type TemplateResult } from "lit";

import type { JobType } from "@/types/crawler";
import { type SectionsEnum } from "@/utils/workflow";

type WorkflowField = {
  section: SectionsEnum;
  jobType?: JobType;
  orgDefault?: boolean;
  key: string;
  input: TemplateResult<1>;
  info: TemplateResult<1>;
};
const fields: WorkflowField[] = [];

export function workflowConfig() {
  return fields;
}
