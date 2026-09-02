import { isCrawl } from "../crawler";

import { OrgTab, WorkflowTab } from "@/routes";
import { type ArchivedItem, type ListArchivedItem } from "@/types/crawler";

export function pathForArchivedItem(item: ListArchivedItem) {
  if (isCrawl(item as ArchivedItem)) {
    return `${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}`;
  }

  return `${OrgTab.Items}/${item.type}/${item.id}`;
}
