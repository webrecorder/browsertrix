import type { Auth } from "@/types/auth";
import type { ArchivedItem } from "@/types/crawler";
import { hasFiles } from "@/utils/crawl-workflows/hasFiles";

/**
 * Get link to download archived item
 */
export function downloadLink(
  item?: ArchivedItem,
  authState?: Auth | null,
): { path: string; name: string } {
  if (!hasFiles(item)) return { path: "", name: "" };

  if (item.resources.length > 1) {
    return {
      path: `/api/orgs/${item.oid}/all-crawls/${item.id}/download?auth_bearer=${authState?.headers.Authorization.split(" ")[1]}`,
      name: `${item.id}.wacz`,
    };
  }

  const { path, name } = item.resources[0];

  return { path, name };
}
