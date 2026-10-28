import { type SearchParamsValue } from "@/controllers/searchParamsValue";
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

function encodeSortDirection(dir: SortDirection) {
  if (dir === SortDirection.Descending) return SortDirectionStr.Descending;
  return SortDirectionStr.Ascending;
}

function decodeSortDirection(dir: SortDirectionStr) {
  if (dir === SortDirectionStr.Descending) return SortDirection.Descending;
  return SortDirection.Ascending;
}

export type SortBy<T extends string> = {
  field: T;
  direction: SortDirection;
};

export function orderByEncoder<T extends string>({
  defaultSort,
  sortableFields,
}: {
  defaultSort: SortBy<T>;
  sortableFields: Record<
    T,
    { label: string; defaultDirection?: SortDirection }
  >;
}): ConstructorParameters<typeof SearchParamsValue<SortBy<T>>>[1] {
  return (value, params) => {
    if (value.field === defaultSort.field) {
      params.delete("sortBy");
    } else {
      params.set("sortBy", value.field);
    }
    if (value.direction === sortableFields[value.field].defaultDirection) {
      params.delete("sortDir");
    } else {
      params.set("sortDir", encodeSortDirection(value.direction));
    }
    return params;
  };
}
export function orderByDecoder<T extends string>({
  defaultSort,
  sortableFields,
}: {
  defaultSort: SortBy<T>;
  sortableFields: Record<
    T,
    { label: string; defaultDirection?: SortDirection }
  >;
}): ConstructorParameters<typeof SearchParamsValue<SortBy<T>>>[2] {
  return (params) => {
    let field = params.get("sortBy") as SortBy<T>["field"] | null;

    if (!field) {
      field = defaultSort.field;
    }
    const sortDir = params.get("sortDir") as ReturnType<
      typeof encodeSortDirection
    > | null;
    let direction =
      sortableFields[field].defaultDirection || defaultSort.direction;

    if (sortDir && validSortDirection(sortDir)) {
      direction = decodeSortDirection(sortDir);
    }

    return { field, direction };
  };
}
