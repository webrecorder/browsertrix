export type APIPaginatedList = {
  items: any[];
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
