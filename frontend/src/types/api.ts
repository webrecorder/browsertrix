import { z } from "zod";

import type { SortDirection } from "./utils";

// Custom regex since Zod .datetime() requires either
// an offset or Z, while our API dates do not
const ISO_8601_REGEX =
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(([+-]\d\d:\d\d)|Z)?$/i;
export const apiDateSchema = z.string().regex(ISO_8601_REGEX);
export type APIDate = z.infer<typeof apiDateSchema>;

/**
 * If no generic type is specified, `items` cannot exist.
 */
export type APIPaginatedList<T = never> = [T] extends [never]
  ? {
      total: number;
      page: number;
      pageSize: number;
    }
  : {
      items: T[];
      total: number;
      page: number;
      pageSize: number;
    };

export type APIPaginationQuery = {
  page?: number;
  pageSize?: number;
};

export type APISortQuery = {
  sortBy?: string;
  sortDirection?: SortDirection;
};
