export type Collection = {
  id: string;
  oid: string;
  name: string;
  description: string | null;
  modified: string; // date
  crawlCount: number;
  pageCount: number;
  totalSize: number;
  tags: string[];
  resources: string[];
  visibility: string;
};

export type CollectionSearchValues = {
  names: string[];
};
