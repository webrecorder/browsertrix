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
  sortDirection?: number; // -1 | 1
};
