import type { ArchivedItem } from "@/types/crawler";
import type { NonEmptyArray } from "@/types/utils";

/**
 * Check whether archived item has at least one WACZ file
 */
export function hasFiles(item?: ArchivedItem): item is ArchivedItem & {
  resources: NonEmptyArray<NonNullable<ArchivedItem["resources"]>[number]>;
} {
  if (!item) return false;
  if (!item.resources) return false;

  return Boolean(item.resources[0]);
}
