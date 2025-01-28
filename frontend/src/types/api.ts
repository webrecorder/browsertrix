import { z } from "zod";

import type { SortDirection } from "./utils";

// Custom date refinement, since Zod .datetime() requires
// either an offset or Z, while our API dates do not
export const apiDateSchema = z.string().refine((v) => !isNaN(Date.parse(v)), {
  message: "String must be a valid date",
});
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

export type APISortQuery<T = Record<string, unknown>> = {
  sortBy?: keyof T;
  sortDirection?: SortDirection;
};
