import type { PageList } from "../page-list";

import type { ArchivedItemPage } from "@/types/crawler";

export const sortBy =
  (pageList: PageList) =>
  (a: ArchivedItemPage, b: ArchivedItemPage): number => {
    const getValue = () => {
      switch (pageList.orderBy.field) {
        case "screenshotMatch":
        case "textMatch":
          return (
            (b[pageList.orderBy.field]?.[pageList.itemPageId] ?? 0) -
            (a[pageList.orderBy.field]?.[pageList.itemPageId] ?? 0)
          );

        case "approved":
          return Number(b.approved) - Number(a.approved);
      }
    };
    return getValue() * (pageList.orderBy.direction === "asc" ? 1 : -1);
  };
