/**
 * If no generic type is specified, `items` cannot exist.
 */
export type APIPaginatedList<T = never> = never extends T
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
  sortDirection?: -1 | 1;
};
