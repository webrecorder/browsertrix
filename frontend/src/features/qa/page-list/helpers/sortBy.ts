import type { OrderBy } from "../page-list";

import type { ArchivedItemPage } from "@/types/crawler";

export const sortBy = (
  a: ArchivedItemPage,
  b: ArchivedItemPage,
  orderBy: OrderBy,
  itemPageId: string,
): number => {
  const getValue = () => {
    switch (orderBy.field) {
      case "screenshotMatch":
      case "textMatch":
        return (
          (b[orderBy.field]?.[itemPageId] ?? 0) -
          (a[orderBy.field]?.[itemPageId] ?? 0)
        );

      case "approved":
        return Number(b.approved) - Number(a.approved);
    }
  };
  return getValue() * (orderBy.direction === "asc" ? 1 : -1);
};
