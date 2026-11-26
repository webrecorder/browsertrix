import { OrgTab, WorkflowTab } from "@/routes";
import { type ArchivedItem } from "@/types/crawler";

// TODO Use `urlForName` after refactoring routes to accept org tab as a parameter
// See https://github.com/webrecorder/browsertrix/issues/3774
export function pathForArchivedItem(
  item: Partial<Pick<ArchivedItem, "id" | "cid" | "type">>,
) {
  if (item.cid) {
    return `${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}`;
  }

  return `${OrgTab.Items}/${item.type}/${item.id}`;
}
