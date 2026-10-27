import { SortDirection } from "@/types/utils";

enum SortDirectionStr {
  Descending = "desc",
  Ascending = "asc",
}

export function validSortDirection(
  dir?: AnyString | null,
): dir is SortDirectionStr {
  if (
    dir &&
    (dir === SortDirectionStr.Descending || dir === SortDirectionStr.Ascending)
  )
    return true;
  return false;
}

export function encodeSortDirection(dir: SortDirection) {
  if (dir === SortDirection.Descending) return SortDirectionStr.Descending;
  return SortDirectionStr.Ascending;
}

export function decodeSortDirection(dir: SortDirectionStr) {
  if (dir === SortDirectionStr.Descending) return SortDirection.Descending;
  return SortDirection.Ascending;
}
