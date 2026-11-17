import { type SearchParamsValue } from "@/controllers/searchParamsValue";
import { SortDirection } from "@/types/utils";

export enum EncodedSortDirection {
  Descending = "desc",
  Ascending = "asc",
}

export type SortBy<T extends string> = {
  field: T;
  direction: SortDirection;
};

export type SortableFields<T extends string> = Record<
  T,
  { label: string; defaultDirection?: SortDirection }
>;

export function validSortDirection(
  dir?: AnyString | null,
): dir is EncodedSortDirection {
  if (
    dir &&
    (dir === EncodedSortDirection.Descending ||
      dir === EncodedSortDirection.Ascending)
  )
    return true;
  return false;
}

function encodeSortDirection(dir: SortDirection) {
  if (dir === SortDirection.Descending) return EncodedSortDirection.Descending;
  return EncodedSortDirection.Ascending;
}

function decodeSortDirection(dir: EncodedSortDirection) {
  if (dir === EncodedSortDirection.Descending) return SortDirection.Descending;
  return SortDirection.Ascending;
}

export type SortBySearchParamsOptions<T extends string> = {
  sortFieldKey?: string;
  sortDirKey?: string;
  defaultSort: SortBy<T>;
  sortableFields: SortableFields<T>;
};

export function sortBySearchParams<T extends string>(
  opts: SortBySearchParamsOptions<T>,
) {
  return [orderByEncoder(opts), orderByDecoder(opts)] as const;
}

export function orderByEncoder<T extends string>({
  sortFieldKey = "sortBy",
  sortDirKey = "sortDir",
  defaultSort,
  sortableFields,
}: SortBySearchParamsOptions<T>): ConstructorParameters<
  typeof SearchParamsValue<SortBy<T>>
>[1] {
  return (value, params) => {
    if (value.field === defaultSort.field) {
      params.delete(sortFieldKey);
    } else {
      params.set(sortFieldKey, value.field);
    }
    if (value.direction === sortableFields[value.field].defaultDirection) {
      params.delete(sortDirKey);
    } else {
      params.set(sortDirKey, encodeSortDirection(value.direction));
    }
    return params;
  };
}
export function orderByDecoder<T extends string>({
  sortFieldKey = "sortBy",
  sortDirKey = "sortDir",
  defaultSort,
  sortableFields,
}: SortBySearchParamsOptions<T>): ConstructorParameters<
  typeof SearchParamsValue<SortBy<T>>
>[2] {
  return (params) => {
    let field = params.get(sortFieldKey) as SortBy<T>["field"] | null;

    if (!field) {
      field = defaultSort.field;
    }
    const sortDir = params.get(sortDirKey) as ReturnType<
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
